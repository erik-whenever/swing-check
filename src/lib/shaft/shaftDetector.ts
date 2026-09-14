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
// WASM PATHS (object form): maps the three .wasm binary filenames ORT can
// request to their self-hosted URLs. With the object form ORT uses its own
// bundled JS loader (already present in the onnxruntime-web/webgpu bundle)
// instead of fetching a .mjs loader file from our origin.
//
// The string form (`'/ort/'`) was tried first — it routes both .wasm and .mjs
// files through the same prefix — but causes Vite's dev-server to reject the
// dynamic import() ORT issues for the .mjs loader: "This file is in /public
// and will be copied as-is during build without going through the plugin
// transforms, and therefore should not be imported from source code."
// The object form avoids that import entirely.
//
// Three binaries are mapped because ORT may choose any of them depending on
// browser capability: jsep.wasm for WebGPU, asyncify.wasm when JSPI is absent
// (wasm provider without native async), and plain .wasm as final fallback.

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
/** Maps each .wasm binary filename ORT may request to its self-hosted URL. */
const ORT_WASM_PATHS: Record<string, string> = {
  'ort-wasm-simd-threaded.wasm': '/ort/ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.wasm': '/ort/ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.wasm': '/ort/ort-wasm-simd-threaded.jsep.wasm',
};

/**
 * Every binary ORT 1.29 may fetch for the webgpu → wasm provider chain, plus
 * the model. Preflighted before session creation so a missing file is named in
 * the error rather than surfacing as an opaque abort or an HTML-parse failure.
 */
const ORT_ARTIFACTS = [
  ...Object.values(ORT_WASM_PATHS),
  MODEL_URL,
];

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
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
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
 * HEAD every ORT artefact before handing control to the runtime. A missing file
 * otherwise surfaces as either an opaque WASM abort (no URL) or — when the SPA
 * catch-all serves index.html in its place — a parse failure as ORT tries to
 * execute HTML as JavaScript. Both modes are silent about which file is missing.
 *
 * Two failure modes are detected explicitly:
 *   - non-2xx status  → file is absent on the server
 *   - text/html body  → SPA fallback masquerading as a binary/JS file
 */
async function preflightAssets(): Promise<void> {
  for (const url of ORT_ARTIFACTS) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch (err) {
      log.error('Shaft asset unreachable', { url, error: serializeError(err) });
      throw new Error(`Shaft asset fetch failed for "${url}": ${String(err)}`, { cause: err });
    }
    if (!res.ok) {
      log.error('Shaft asset missing', { url, status: res.status });
      throw new Error(
        `Shaft asset "${url}" returned HTTP ${res.status}. ` +
          'Run "npm run shaft:wasm" to copy all ORT runtime files, and ' +
          'export the model to public/models/shaft-v1.onnx (training/export_onnx.py).',
      );
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      log.error('Shaft asset returned HTML — SPA catch-all served index.html for missing file', {
        url,
        contentType: ct,
      });
      throw new Error(
        `Shaft asset "${url}" returned HTML (content-type: ${ct}). ` +
          'The file is missing from public/ort/ and the SPA catch-all is serving index.html in its place. ' +
          'Run "npm run shaft:wasm" to copy all ORT runtime files.',
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
