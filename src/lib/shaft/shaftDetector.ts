// Singleton ONNX Runtime session for the 2-point shaft detector (butt + hosel).
//
// STANDS ALONE. Nothing here imports from the pose chain and nothing in the pose
// chain imports from here: this is a second, independent detector that happens to
// run on frames pose selection already produced. `frameExtractor.ts`,
// `poseEnvelope.ts`, `poseSegments.ts` and `poseEnvelopeSelection.ts` are untouched
// by this whole directory.
//
// NEVER CALL THIS FROM A rAF LOOP. One inference is tens to hundreds of
// milliseconds of synchronous WASM on the main thread. The detector is for the ~20
// frames `selectEnvelopeFrames` has already picked, after the swing is over — the
// same budget the annotation spec was written around. Anything per-displayed-frame
// belongs to MediaPipe (`livePoseLoop.ts`), not here.
//
// ASSETS ARE LAZY, NOT PRECACHED — a deliberate trade (see vite.config.ts for the
// service-worker half). The model is 12.4 MB and the ONNX Runtime WASM another
// 13.3 MB. The install-time precache already carries ~16 MB of pose assets; adding
// 26 MB more would nearly triple a first install for every user, including everyone
// who never reaches a shaft-detector surface — today that is everyone, since the
// only caller is behind VITE_DEV_PREVIEW. So both files load on first use and the
// service worker keeps them under a CacheFirst runtime rule: one slow first run,
// offline for good afterwards. Revisit when shaft detection joins the production
// analysis path — at that point "first use" is every user's first swing, and
// precaching becomes the honest default.
//
// Both files are served from our own origin, like the MediaPipe runtime and for the
// same reason (BACKLOG D-2): no CDN request, and the runtime can never drift from
// the JS bindings, because `npm run shaft:wasm` copies it out of the installed
// package.

import * as ort from 'onnxruntime-web/wasm';
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
 * The runtime binary, named explicitly rather than via a directory prefix.
 *
 * `wasmPaths` also accepts a string prefix, and that is the form most ORT examples
 * use — but a prefix makes ORT resolve its Emscripten LOADER (`….mjs`) against it
 * too, and `import()`-ing a file out of `public/` is exactly what Vite's dev server
 * refuses ("This file is in /public … should not be imported from source code",
 * HTTP 500). The object form overrides only the binary, so the loader stays the
 * copy already inlined in the `onnxruntime-web/wasm` bundle we import — which is
 * what that build variant exists for. One file to self-host, and dev and prod
 * behave the same.
 */
const WASM_URL = '/ort/ort-wasm-simd-threaded.wasm';

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
}

// ── Session ──────────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

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
        // Do not cache the failure: a missing asset is usually a deploy problem that
        // a reload fixes, and a permanently poisoned promise would hide the fix
        // behind a restart.
        loading = null;
        throw err;
      });
  }
  return loading;
}

async function create(): Promise<ort.InferenceSession> {
  // Same origin, no CDN. See WASM_URL for why this is the object form.
  ort.env.wasm.wasmPaths = { wasm: WASM_URL };
  // ONE thread, deliberately. Multi-threaded WASM needs SharedArrayBuffer, which
  // needs COOP/COEP cross-origin isolation — and turning that on would change how
  // every other cross-origin load in the app behaves, for a detector that runs ~20
  // times after a swing. ORT would fall back to 1 anyway; pinning it keeps desktop
  // and iPhone on the same code path and the measured timings comparable.
  ort.env.wasm.numThreads = 1;

  await preflightAssets();

  const t0 = performance.now();
  const built = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  log.warn('Shaft session ready', {
    loadMs: Math.round(performance.now() - t0),
    inputs: built.inputNames,
    outputs: built.outputNames,
    threads: ort.env.wasm.numThreads,
  });
  return built;
}

/**
 * HEAD both assets before handing them to ONNX Runtime. A missing model or WASM
 * otherwise surfaces as an abort from inside the WASM module with no URL in it —
 * the same failure mode `poseDetector`'s preflight exists to avoid.
 */
async function preflightAssets(): Promise<void> {
  for (const url of [MODEL_URL, WASM_URL]) {
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
  };

  log.debug('Shaft frame', {
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
