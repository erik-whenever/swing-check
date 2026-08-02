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
import { createLogger } from './logger';

const log = createLogger('PoseDetector');

const WASM_PATH = '/wasm';
const MODEL_URL = '/models/pose_landmarker_lite.task';

let instance: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

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
  let landmarker: PoseLandmarker;
  let used: 'GPU' | 'CPU' = 'GPU';
  try {
    landmarker = await build('GPU');
  } catch (err) {
    // GPU delegate is unavailable on some devices/browsers (no WebGL2, locked-
    // down iOS, etc). Fall back to CPU so pose detection still works.
    used = 'CPU';
    log.warn('GPU delegate failed — falling back to CPU', { error: String(err) });
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
