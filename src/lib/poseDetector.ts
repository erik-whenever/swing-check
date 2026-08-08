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
/** Delegate that actually worked on this device, so a rebuild skips the GPU probe. */
let workingDelegate: 'GPU' | 'CPU' | null = null;

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
  return (await createWithDelegate()).landmarker;
}

async function createWithDelegate(): Promise<{
  landmarker: PoseLandmarker;
  delegate: 'GPU' | 'CPU';
}> {
  const t0 = performance.now();
  // Fail loud and specific if the assets aren't served, before MediaPipe turns
  // the 404 into an opaque load Event on both delegates.
  await preflightAssets();
  let landmarker: PoseLandmarker;
  let used: 'GPU' | 'CPU';
  if (workingDelegate) {
    // Delegate already probed this session — don't re-probe. A rebuild (see
    // resetPoseLandmarker) would otherwise pay the GPU failure + fallback twice
    // on every clip on devices without WebGL2.
    used = workingDelegate;
    landmarker = await build(workingDelegate);
  } else {
    used = 'GPU';
    try {
      landmarker = await build('GPU');
    } catch (err) {
      // GPU delegate is unavailable on some devices/browsers (no WebGL2, locked-
      // down iOS, etc). Fall back to CPU so pose detection still works.
      used = 'CPU';
      log.warn('GPU delegate failed — falling back to CPU', { error: serializeError(err) });
      landmarker = await build('CPU');
    }
    workingDelegate = used;
  }
  log.info('PoseLandmarker loaded', {
    loadMs: Math.round(performance.now() - t0),
    delegate: used,
    model: 'pose_landmarker_lite',
  });
  return { landmarker, delegate: used };
}

/** A landmarker owned by exactly one caller, with its own tracking graph. */
export interface StandalonePoseLandmarker {
  landmarker: PoseLandmarker;
  delegate: 'GPU' | 'CPU';
  /** Release the graph (and its GPU context). Safe to call twice. */
  close(): void;
}

/**
 * Build a landmarker that is NOT the shared singleton — for the live capture loop
 * (ADR-003 §4).
 *
 * WHY A SEPARATE INSTANCE, not `getPoseLandmarker()`. Two independent reasons, both
 * structural rather than stylistic:
 *
 * 1. `runningMode: 'VIDEO'` demands a strictly increasing timestamp per INSTANCE, and
 *    the live loop runs on a wall-clock timeline while the clip path runs on a
 *    per-clip timeline that restarts at 0. Sharing one graph would mean one of them
 *    has to yield its timeline to the other.
 * 2. `resetPoseLandmarker()` exists precisely because the shared graph is single-tenant
 *    for the duration of one extraction (see its OSÄKER note). The live loop overlaps
 *    the end of a recording with the start of the clip-path extraction by however many
 *    milliseconds React takes to unmount it — sharing would let those two reset each
 *    other's graph mid-run. With its own instance the overlap is harmless.
 *
 * The caller MUST `close()` it; nothing here tracks it. The delegate probe result is
 * shared with the singleton path, so this does not re-pay the GPU failure on devices
 * without WebGL2.
 */
export async function createPoseLandmarker(): Promise<StandalonePoseLandmarker> {
  const { landmarker, delegate } = await createWithDelegate();
  let closed = false;
  return {
    landmarker,
    delegate,
    close: () => {
      if (closed) return;
      closed = true;
      try {
        landmarker.close();
      } catch (err) {
        // Never let disposal take down the caller — worst case is one leaked graph,
        // which is strictly better than an unhandled throw on the teardown path.
        log.warn('Standalone PoseLandmarker close() failed', { error: serializeError(err) });
      }
    },
  };
}

/**
 * Dispose the shared landmarker so the NEXT `getPoseLandmarker()` builds a cold one.
 *
 * WHY THIS HAS TO EXIST — measured determinism bug. `runningMode: 'VIDEO'` is a
 * TRACKING mode: each frame is seeded with the previous frame's detection (ROI
 * tracking) instead of running the full detector. Because the landmarker was a
 * process-lifetime singleton, run 2 over a clip started with the tracking state left
 * behind by run 1's LAST frame — the golfer walking out of shot — rather than from
 * nothing. Same file, same code, different landmarks: measured `posesDetected` of
 * 924 / 929 / 924 across three runs of one clip, and a `refSpeed` swing of ~11 %.
 * Downstream that is not cosmetic: a sub-frame difference in the sampled series moves
 * the number of detected swings (see docs/decisions/ADR-003-draft.md).
 *
 * It also made FIXTURES unreproducible: `__fixtures__/*.json` were exported from one
 * particular run and could never be reproduced live, so a green harness said nothing
 * about the browser.
 *
 * A full rebuild is used rather than `setOptions()`: `setOptions` is documented to
 * refresh the graph, which SHOULD clear tracking state, but "should" is not a
 * guarantee we can assert from here — a fresh instance is cold by construction. The
 * cost is graph construction only (the model and WASM come from the HTTP/service-worker
 * cache), which is negligible against the hundreds of seek+infer cycles that follow.
 *
 * OSÄKER: this makes the landmarker single-tenant for the duration of one extraction.
 * Today's callers are sequential (`frameExtractor.selectViaPose`, then the dev
 * preview), so nothing overlaps. Two CONCURRENT extractions would now reset each
 * other's graph mid-run and corrupt both — if a caller ever runs them in parallel,
 * serialise the extractions first.
 */
export async function resetPoseLandmarker(): Promise<void> {
  // Never leave a half-built instance behind: wait out an in-flight build so the
  // close below actually releases it (and its GPU context) instead of leaking it.
  if (loading) {
    try {
      await loading;
    } catch {
      // A failed build already cleared itself; nothing to dispose.
    }
  }
  const previous = instance;
  instance = null;
  loading = null;
  if (previous) {
    try {
      previous.close();
    } catch (err) {
      // Disposal failure must not block the next extraction; it only risks leaking
      // this one instance, whereas throwing here would take the whole pose path down.
      log.warn('PoseLandmarker close() failed', { error: serializeError(err) });
    }
  }
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
