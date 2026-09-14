// Singleton ONNX Runtime session for the 2-point shaft detector (butt + hosel).
//
// STANDS ALONE. Nothing here imports from the pose chain and nothing in the pose
// chain imports from here: this is a second, independent detector that happens to
// run on frames pose selection already produced. `frameExtractor.ts`,
// `poseEnvelope.ts`, `poseSegments.ts` and `poseEnvelopeSelection.ts` are untouched
// by this whole directory.
//
// NEVER CALL THIS FROM A rAF LOOP. One inference is tens to hundreds of
// milliseconds on the main thread. The detector is for the ~20 frames
// `selectEnvelopeFrames` has already picked, after the swing is over — the same
// budget the annotation spec was written around. Anything per-displayed-frame
// belongs to MediaPipe (`livePoseLoop.ts`), not here.
//
// ASSETS ARE LAZY, NOT PRECACHED — a deliberate trade (see vite.config.ts for the
// service-worker half). The model is 12.4 MB and the ONNX Runtime binaries another
// ~40 MB total. The install-time precache already carries ~16 MB of pose assets;
// adding 50+ MB more would nearly triple a first install for every user, including
// everyone who never reaches a shaft-detector surface. Both load on first use and
// the service worker keeps them under a CacheFirst runtime rule. Revisit when shaft
// detection joins the production analysis path.
//
// Both files are served from our own origin, like the MediaPipe runtime and for the
// same reason (BACKLOG D-2): no CDN request, and the runtime can never drift from
// the JS bindings, because `npm run shaft:wasm` copies them out of the installed
// package.
//
// PROVIDER CHAIN: webgpu → wasm. WebGPU is tried first because it requires no
// COOP/COEP cross-origin isolation and typically cuts inference time by 5–10×. A
// silent WASM fallback is worse than a visible error — so we log the chosen provider
// explicitly on every session startup. On the first real frame after choosing WebGPU
// we also verify numerical equivalence against a WASM reference run.
//
// PATH PREFIX (ORT_PATH_PREFIX, string form): safe with ORT 1.29 because Emscripten
// ≥3.1.58 only calls locateFile() for .wasm files, never for .mjs loaders — so the
// Vite dev-server restriction ("This file is in /public, should not be imported")
// does not apply. This lets a single prefix route both the regular WASM binary and
// the JSEP binary to our origin. The object form `{ wasm: URL }` only works for the
// regular binary and cannot serve the JSEP binary; the string form is the correct
// approach here.

// `onnxruntime-web/webgpu` imports the JSEP backend, which handles both
// WebGPU (GPU dispatch) and wasm (CPU dispatch) within a single binary.
import * as ort from 'onnxruntime-web/webgpu';
import { createLogger, serializeError } from '../logger';
import {
  computeLetterbox,
  modelToImage,
  PAD_VALUE,
  type LetterboxTransform,
} from './letterbox';
import {
  CHANNELS,
  CONF_THRESHOLD,
  IOU_THRESHOLD,
  KEYPOINT_THRESHOLD,
  selectBest,
} from './shaftPostprocess';

const log = createLogger('ShaftDetector');

/** Square input side the checkpoint was exported at (training/README.md). */
export const MODEL_INPUT_SIZE = 960;
const MODEL_URL = '/models/shaft-v1.onnx';
/**
 * String path prefix for all ORT WASM binaries. Served from our own origin.
 *
 * The string form passes a `locateFile(filename)` implementation that returns
 * `ORT_PATH_PREFIX + filename`. This routes BOTH the regular WASM binary
 * (`ort-wasm-simd-threaded.wasm`) and the JSEP binary
 * (`ort-wasm-simd-threaded.jsep.wasm`) to our /ort/ directory. The object form
 * `{ wasm: URL }` cannot do this — it always returns the same fixed URL regardless
 * of which binary is being resolved.
 *
 * The .mjs loaders are NOT resolved through locateFile (Emscripten ≥3.1.58 changed
 * that), so there is no risk of Vite refusing to serve a public/ file as a module.
 * See the block comment at the top of this file for the full reasoning.
 */
const ORT_PATH_PREFIX = '/ort/';
/** Preflight URL for the JSEP binary. Both binaries live in the same directory. */
const JSEP_WASM_URL = '/ort/ort-wasm-simd-threaded.jsep.wasm';

export interface ShaftPoint {
  /** X in the SOURCE image's own pixels — letterbox padding already removed. */
  x: number;
  /** Y in the SOURCE image's own pixels. */
  y: number;
  /** Keypoint visibility score, [0, 1]. Always >= KEYPOINT_THRESHOLD when present. */
  conf: number;
}

export interface ShaftDetection {
  /** Grip end, or null when the model did not locate it. */
  butt: ShaftPoint | null;
  /** Where the straight part of the shaft ends, or null. */
  hosel: ShaftPoint | null;
  /** Confidence of the winning box; 0 when no box cleared CONF_THRESHOLD. */
  boxConf: number;
  /** `session.run()` wall time, ms. Decode and letterboxing are not counted. */
  inferenceMs: number;
  /** JPEG decode + letterbox draw + tensor fill, ms. */
  preprocessMs: number;
  /** Source image size, px — what the coordinates above are relative to. */
  imageSize: { width: number; height: number };
  /** Which execution provider ran this inference. */
  provider: 'webgpu' | 'wasm';
}

// ── Session ──────────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;
/** Provider chosen when the session was created. Persists until reset. */
let chosenProvider: 'webgpu' | 'wasm' = 'wasm';
/** Whether the one-shot numerical equivalence check has run for this session. */
let equivalenceChecked = false;
/** Per-frame inference timings, accumulated to report the median. */
const inferTimings: number[] = [];

/**
 * Build the session once and hand the same instance to every caller. Concurrent
 * first calls share one `loading` promise rather than each paying a 12 MB fetch and
 * a WASM compile.
 */
export function loadShaftSession(): Promise<ort.InferenceSession> {
  if (session) return Promise.resolve(session);
  if (!loading) {
    loading = create()
      .then((built) => {
        session = built;
        return built;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

/** Which execution provider the current session is using. */
export function shaftSessionProvider(): 'webgpu' | 'wasm' {
  return chosenProvider;
}

async function create(): Promise<ort.InferenceSession> {
  // String prefix: locateFile(filename) → '/ort/' + filename.
  // Resolves both ort-wasm-simd-threaded.wasm and ort-wasm-simd-threaded.jsep.wasm.
  ort.env.wasm.wasmPaths = ORT_PATH_PREFIX;
  // ONE thread, deliberately. COOP/COEP isolation is not set, so multi-thread WASM
  // is unavailable anyway. Pinning keeps all devices on the same code path.
  ort.env.wasm.numThreads = 1;

  await preflightAssets();

  const t0 = performance.now();
  let built: ort.InferenceSession;

  // WebGPU first: no COOP/COEP needed, typically 5–10× faster than WASM on desktop.
  // A silent fallback is worse than a visible one — always log the chosen provider.
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      built = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      chosenProvider = 'webgpu';
    } catch (gpuErr) {
      log.warn('WebGPU session failed — falling back to WASM', {
        error: serializeError(gpuErr),
      });
      built = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      chosenProvider = 'wasm';
    }
  } else {
    log.warn('navigator.gpu absent — using WASM');
    built = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    chosenProvider = 'wasm';
  }

  log.warn('Shaft session ready', {
    provider: chosenProvider,
    loadMs: Math.round(performance.now() - t0),
    inputs: built.inputNames,
    outputs: built.outputNames,
  });

  if (chosenProvider === 'webgpu') {
    // Run the equivalence check in the background; do not block the caller.
    verifyEquivalence(built).catch((err) =>
      log.warn('Equivalence check error', { error: serializeError(err) }),
    );
  }

  return built;
}

/**
 * One-shot check: run a synthetic input through both the active (WebGPU) session
 * and a temporary WASM session, compare raw output tensors, and report whether they
 * agree within ~1 px of model coordinate space. Called once after a WebGPU session
 * is created. If the outputs diverge by more than 1.0 (≈1 px in 960 px model
 * space), a warning is logged — the session is NOT replaced, just flagged.
 */
async function verifyEquivalence(gpuSession: ort.InferenceSession): Promise<void> {
  if (equivalenceChecked) return;
  equivalenceChecked = true;

  // All-grey synthetic frame (0.5 per channel). Biased toward no-detection, but
  // exercises the full graph and gives both sessions the same numerical input.
  const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const syntheticData = new Float32Array(3 * pixels).fill(0.5);
  const syntheticTensor = new ort.Tensor('float32', syntheticData, [
    1,
    3,
    MODEL_INPUT_SIZE,
    MODEL_INPUT_SIZE,
  ]);

  let wasmSession: ort.InferenceSession | null = null;
  try {
    wasmSession = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    const [gpuOut, wasmOut] = await Promise.all([
      gpuSession.run({ [gpuSession.inputNames[0]]: syntheticTensor }),
      wasmSession.run({ [wasmSession.inputNames[0]]: syntheticTensor }),
    ]);

    const gpuData = gpuOut[gpuSession.outputNames[0]].data as Float32Array;
    const wasmData = wasmOut[wasmSession.outputNames[0]].data as Float32Array;

    let maxAbsDiff = 0;
    for (let i = 0; i < gpuData.length; i++) {
      const d = Math.abs(gpuData[i] - wasmData[i]);
      if (d > maxAbsDiff) maxAbsDiff = d;
    }

    // Coordinate outputs are in model pixel space (0–960); 1.0 ≈ 1 px.
    const PX_TOLERANCE = 1.0;
    if (maxAbsDiff <= PX_TOLERANCE) {
      log.warn('WebGPU ↔ WASM equivalence OK', { maxAbsDiff: round3(maxAbsDiff) });
    } else {
      log.warn('⚠ WebGPU ↔ WASM equivalence FAILED — outputs diverge beyond 1 px', {
        maxAbsDiff: round3(maxAbsDiff),
        tolerance: PX_TOLERANCE,
        note: 'Using WebGPU results; coordinates may differ from WASM baseline',
      });
    }
  } finally {
    await wasmSession?.release();
  }
}

/**
 * HEAD both assets before handing them to ONNX Runtime. A missing model or WASM
 * otherwise surfaces as an abort from inside the WASM module with no URL in it —
 * the same failure mode `poseDetector`'s preflight exists to avoid.
 */
async function preflightAssets(): Promise<void> {
  for (const url of [MODEL_URL, JSEP_WASM_URL]) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch (err) {
      log.error('Shaft asset unreachable', { url, error: serializeError(err) });
      throw new Error(`Shaft asset fetch failed for ${url}: ${String(err)}`, { cause: err });
    }
    if (!res.ok) {
      log.error('Shaft asset missing', { url, status: res.status });
      throw new Error(
        `Shaft asset ${url} returned HTTP ${res.status}. Run "npm run shaft:wasm" and ` +
          'export the model to public/models/shaft-v1.onnx (training/export_onnx.py).',
      );
    }
  }
}

/** Drop the session (frees the WASM arena). The next call rebuilds it. */
export async function resetShaftSession(): Promise<void> {
  const current = session;
  session = null;
  loading = null;
  chosenProvider = 'wasm';
  equivalenceChecked = false;
  inferTimings.length = 0;
  await current?.release();
}

// ── Inference ────────────────────────────────────────────────────────────────

/**
 * Run the detector on ONE frame.
 *
 * `jpegBase64` is exactly what `grabFramesAtTimes` returns: a bare base64 JPEG
 * payload with no data-URL prefix.
 *
 * Returned coordinates are in the source image's own pixel space. Either point is
 * null when the model located the club but not that end of it — the annotation
 * spec's `outside` case, which is common enough (the grip behind a shoulder, the
 * head out of frame) that collapsing it to a guessed coordinate would be worse than
 * reporting the gap.
 */
export async function detectShaft(jpegBase64: string): Promise<ShaftDetection> {
  const model = await loadShaftSession();

  const t0 = performance.now();
  const bitmap = await decodeJpeg(jpegBase64);
  const imageSize = { width: bitmap.width, height: bitmap.height };
  const transform = computeLetterbox(bitmap.width, bitmap.height, MODEL_INPUT_SIZE);
  const input = toTensor(bitmap, transform);
  bitmap.close();
  const preprocessMs = performance.now() - t0;

  const t1 = performance.now();
  const outputs = await model.run({ [model.inputNames[0]]: input });
  const inferenceMs = performance.now() - t1;

  // Accumulate timings and report the median once we have a useful sample.
  inferTimings.push(inferenceMs);
  if (inferTimings.length === 5) {
    const sorted = [...inferTimings].sort((a, b) => a - b);
    log.warn('Shaft inference timings', {
      provider: chosenProvider,
      sampleN: inferTimings.length,
      medianMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
      minMs: Math.round(sorted[0]),
      maxMs: Math.round(sorted[sorted.length - 1]),
    });
  }

  const output = outputs[model.outputNames[0]];
  const dims = output.dims;
  if (dims.length !== 3 || dims[0] !== 1 || dims[1] !== CHANNELS) {
    throw new Error(
      `Unexpected shaft output shape [${dims.join(', ')}] — expected [1, ${CHANNELS}, N]`,
    );
  }
  const { best, kept, candidates } = selectBest(output.data as Float32Array, dims[2], {
    confThreshold: CONF_THRESHOLD,
    iouThreshold: IOU_THRESHOLD,
  });

  // The ONE place model pixels become image pixels. Everything downstream — the dev
  // overlay, any future rule — reads the image-space numbers and never sees 960².
  const toPoint = (kp: { x: number; y: number; score: number }): ShaftPoint | null => {
    if (kp.score < KEYPOINT_THRESHOLD) return null;
    const p = modelToImage(transform, kp);
    return { x: p.x, y: p.y, conf: kp.score };
  };

  const detection: ShaftDetection = {
    butt: best ? toPoint(best.butt) : null,
    hosel: best ? toPoint(best.hosel) : null,
    boxConf: best?.conf ?? 0,
    inferenceMs,
    preprocessMs,
    imageSize,
    provider: chosenProvider,
  };

  log.debug('Shaft frame', {
    provider: chosenProvider,
    candidates,
    kept,
    boxConf: round3(detection.boxConf),
    butt: detection.butt ? [Math.round(detection.butt.x), Math.round(detection.butt.y)] : null,
    hosel: detection.hosel
      ? [Math.round(detection.hosel.x), Math.round(detection.hosel.y)]
      : null,
    inferenceMs: Math.round(inferenceMs),
    preprocessMs: Math.round(preprocessMs),
  });

  return detection;
}

// ── Preprocessing ────────────────────────────────────────────────────────────

async function decodeJpeg(base64: string): Promise<ImageBitmap> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
}

type Scratch = {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  size: number;
};

/** Reused between frames — a fresh 960² canvas per frame is pure garbage. */
let scratch: Scratch | null = null;

function getScratch(size: number): Scratch {
  if (scratch && scratch.size === size) return scratch;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  scratch = { ctx: ctx as CanvasRenderingContext2D, size };
  return scratch;
}

/**
 * ImageBitmap → `[1, 3, size, size]` float32, RGB, 0–1 — the input the export
 * describes (training/README.md → "In- och utdataformat"), with the letterbox
 * applied.
 */
function toTensor(bitmap: ImageBitmap, t: LetterboxTransform): ort.Tensor {
  const { ctx } = getScratch(t.size);
  // Bilinear, not the browser's fancy downscaler: cv2.INTER_LINEAR is what the
  // training pipeline resamples with, and a higher-quality filter hands the model
  // slightly different high-frequency content than it was trained on.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.fillStyle = `rgb(${PAD_VALUE}, ${PAD_VALUE}, ${PAD_VALUE})`;
  ctx.fillRect(0, 0, t.size, t.size);
  ctx.drawImage(bitmap, t.padX, t.padY, t.drawWidth, t.drawHeight);

  const { data } = ctx.getImageData(0, 0, t.size, t.size);
  const pixels = t.size * t.size;
  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    chw[i] = data[i * 4] / 255;
    chw[pixels + i] = data[i * 4 + 1] / 255;
    chw[2 * pixels + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', chw, [1, 3, t.size, t.size]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
