// Singleton loader for the MediaPipe PoseLandmarker.
//
// The landmarker is expensive to construct (downloads + compiles the WASM
// runtime and the ~5 MB .task model), so we build it exactly once and hand the
// same instance to every caller. runningMode is 'VIDEO' because we drive it by
// seeking a hidden <video> frame-by-frame (see poseTrajectory.ts).
//
// Both the WASM runtime and the model are served from our own origin so pose
// detection works fully offline (no jsDelivr requests). The WASM is copied from
// node_modules via `npm run pose:wasm` and precached by the service worker; the
// model is fetched via `npm run pose:model` (see BACKLOG D-2). Because the WASM
// comes straight from the installed package, the runtime and JS bindings can
// never drift apart.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createLogger, serializeError } from './logger';

const log = createLogger('PoseDetector');

const WASM_PATH = '/wasm';
const MODEL_URL = '/models/pose_landmarker_lite.task';
// The JS loader FilesetResolver fetches first; if this 404s (assets missing from
// the deploy) the real error is swallowed as an opaque WASM-load Event.
const WASM_LOADER_URL = `${WASM_PATH}/vision_wasm_internal.js`;

let instance: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

/**
 * Preflight the pose assets before handing them to MediaPipe. A missing WASM
 * runtime or model (e.g. a deploy that never ran `pose:assets`) otherwise
 * surfaces only as an opaque GPU/CPU load Event; here we HEAD each URL and log
 * the exact URL + HTTP status so the failure is diagnosable, then throw a clear
 * error instead of letting the whole thing collapse into "[object Event]".
 */
async function preflightAssets(): Promise<void> {
  for (const url of [WASM_LOADER_URL, MODEL_URL]) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch (err) {
      log.error('Pose asset unreachable', { url, error: serializeError(err) });
      throw new Error(`Pose asset fetch failed for ${url}: ${String(err)}`, { cause: err });
    }
    if (!res.ok) {
      log.error('Pose asset missing', { url, status: res.status, statusText: res.statusText });
      throw new Error(`Pose asset ${url} returned HTTP ${res.status}`);
    }
  }
}

async function build(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

async function create(): Promise<PoseLandmarker> {
  const t0 = performance.now();
  // Fail loud and specific if the assets aren't served, before MediaPipe turns
  // the 404 into an opaque load Event on both delegates.
  await preflightAssets();
  let landmarker: PoseLandmarker;
  let used: 'GPU' | 'CPU' = 'GPU';
  try {
    landmarker = await build('GPU');
  } catch (err) {
    // GPU delegate is unavailable on some devices/browsers (no WebGL2, locked-
    // down iOS, etc). Fall back to CPU so pose detection still works.
    used = 'CPU';
    log.warn('GPU delegate failed — falling back to CPU', { error: serializeError(err) });
    landmarker = await build('CPU');
  }
  log.info('PoseLandmarker loaded', {
    loadMs: Math.round(performance.now() - t0),
    delegate: used,
    model: 'pose_landmarker_lite',
  });
  return landmarker;
}

/**
 * Get the shared PoseLandmarker, constructing it on first call. Concurrent
 * callers await the same in-flight build; a failed build is not cached so a
 * later call can retry.
 */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = create().then(
      (l) => {
        instance = l;
        return l;
      },
      (err) => {
        loading = null;
        throw err;
      },
    );
  }
  return loading;
}
