// RAW DATA LAYER — what the shaft detector produced for one swing, and nothing else.
//
// This is the interface between the detector and everything above it. It is pure
// data: no computation, no interpretation, no import of `onnxruntime-web`, no
// `document`, no `performance`, no `import.meta.env`. A record that can be JSON-parsed
// on a server, in a Node test, or in a native runtime after a platform switch
// (docs/oppna-fragor.md → F6) is a record that survives both that switch and a detector
// swap; a record that reaches into the browser is not.
//
// WHY A SEPARATE SHAPE FROM `ShaftDetection`. `shaftDetector.ts` returns what one
// inference call produced — timings, execution provider, image size — keyed to nothing
// and spanning no time. Rules need the opposite: a swing, in order, with phases and
// timestamps, and with the identity of the model that produced it travelling alongside
// the numbers rather than being remembered by the caller. The adapter between the two
// lives in `fromDetection.ts`, so that this file keeps no edge at all to the runtime,
// not even a type-only one.
//
// ANGLES ARE CARRIED, NOT COMPUTED HERE. `shaftAngleDeg` and `bladeAngleDeg` are fields
// on the sample because they are what every consumer wants, and recomputing them in
// four places is how two of them end up with a different wrap convention. The
// computation is `angles.ts`; the producer fills the fields. This module stays data.
//
// BLADE ANGLE IS CARRIED AND NOT EXPOSED UPWARD. `bladeAngleDeg` has a home here on
// purpose — dropping the measurement would make the decision unfalsifiable, and a
// four-point checkpoint would have nowhere to land. It is deliberately absent from the
// derived measurements (`derived.ts`); the evidence is in `docs/shaft/datamodell.md`.

import type { CameraAngle } from '../../cameraAngle';

/**
 * The annotation spec's eight frame phases (docs/shaft/annotation-spec.md →
 * *Frame-attribut*), redeclared here rather than imported.
 *
 * `ShaftPhase` in `src/lib/dataset/datasetTypes.ts` is the same eight values, but that
 * module is DEV-ONLY and reads `import.meta.env` at module scope — importing it would
 * put a browser build constant inside the one layer that must not have one.
 * `shaftSeries.test.ts` pins the two lists equal so the duplication cannot drift.
 *
 * NOT `SwingPhase` from `frameExtractor.ts`: that set is six values and folds `through`
 * and `finish` into one `follow-through`. A shaft mid-follow-through and a shaft held
 * at the finish are different measurements, so they stay apart here.
 */
export type MeasurementPhase =
  | 'idle'
  | 'address'
  | 'backswing'
  | 'top'
  | 'downswing'
  | 'impact'
  | 'through'
  | 'finish';

/** Swing order. Every per-phase table in this folder is keyed and reported in it. */
export const MEASUREMENT_PHASES: readonly MeasurementPhase[] = [
  'idle',
  'address',
  'backswing',
  'top',
  'downswing',
  'impact',
  'through',
  'finish',
] as const;

/** A point in the SOURCE frame's own pixels — letterbox padding already removed. */
export interface Point2D {
  x: number;
  y: number;
}

/** A located keypoint: a point plus the visibility score the model gave it. */
export interface ShaftKeypoint extends Point2D {
  /** Keypoint visibility, [0, 1], exactly as the model reported it — never rescaled. */
  conf: number;
}

/** The four shaft keypoints, in the schema's fixed order. */
export const SHAFT_KEYPOINT_NAMES = ['butt', 'hosel', 'toe', 'heel'] as const;
export type ShaftKeypointName = (typeof SHAFT_KEYPOINT_NAMES)[number];

/**
 * The MediaPipe landmarks the derived measurements are allowed to lean on, in the same
 * pixel space as the shaft keypoints.
 *
 * SIX, NOT THIRTY-THREE. Carrying the whole landmark set would make this record a copy
 * of the pose trajectory and tie the shaft layer's size to MediaPipe's topology. These
 * six are what "the shaft relative to the body" needs: the shoulder line and the hip
 * line give an origin and two scales, the wrists say where the hands are. Anything
 * wanting more should read the pose trajectory itself.
 *
 * `left`/`right` are MediaPipe's own sides (the subject's left and right), NOT image
 * sides, and they do not tell you handedness — see `Handedness` in `derived.ts`.
 */
export const BODY_LANDMARK_NAMES = [
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftWrist',
  'rightWrist',
] as const;
export type BodyLandmarkName = (typeof BODY_LANDMARK_NAMES)[number];

/** The six landmarks above, in image pixels. Any of them may be absent. */
export type BodyReference = { [K in BodyLandmarkName]: Point2D | null };

/** Which model produced a series, carried with the numbers rather than remembered. */
export interface ShaftModelIdentity {
  /**
   * The checkpoint's file name, e.g. `shaft-v2.onnx` — whatever `MODEL_FILE` was at the
   * time. A bare string and not a union: a series read back from disk next year must
   * still parse when the name is one this build has never heard of.
   */
  file: string;
  /**
   * How many keypoints that graph carries: 4 for the schema, 2 for every checkpoint
   * trained before `toe`/`heel` existed. Recorded rather than inferred from which
   * fields are null, because "this model has no toe" and "this frame has no visible
   * toe" are different facts, and a consumer that conflates them draws the wrong
   * conclusion from the same `null`.
   */
  keypoints: number;
  /** Execution provider, when the producer knew it. Provenance only; never read. */
  provider?: string;
}

/** One analysed frame of one swing. */
export interface ShaftFrameSample {
  /** Time within the CLIP, seconds — the same clock `FrameMetadata.tSec` uses. */
  tSec: number;
  phase: MeasurementPhase;
  /** Grip end, or null when the model did not locate it. */
  butt: ShaftKeypoint | null;
  /** Where the straight part of the shaft ends, or null. */
  hosel: ShaftKeypoint | null;
  /** Outer end of the sole, or null. Always null under a two-point checkpoint. */
  toe: ShaftKeypoint | null;
  /** Inner end of the sole, or null. Always null under a two-point checkpoint. */
  heel: ShaftKeypoint | null;
  /**
   * Direction of `butt → hosel`, degrees, `atan2(dy, dx)` in image coordinates (y
   * downward), range (-180, 180]. Null when either endpoint is missing.
   *
   * Same convention and same directed vector as `angle_deg` / `ANGLES` in
   * `training/evaluate.py`, so a number measured in the browser and a number measured
   * in the Python evaluation are the same number.
   */
  shaftAngleDeg: number | null;
  /**
   * Direction of `heel → toe`, same convention. Null when either sole point is missing
   * — which is every frame under the shipped two-point checkpoint.
   *
   * DIAGNOSTIC ONLY. Nothing in `derived.ts` reads this. See the file header.
   */
  bladeAngleDeg: number | null;
  /** The body landmarks for this frame, or null when no pose was detected. */
  body: BodyReference | null;
}

/** One swing's worth of detector output. The unit everything above operates on. */
export interface ShaftSwingSeries {
  /** Source clip's file name, verbatim — the string `FrameMetadata.clipName` holds. */
  clipName: string;
  /** 0-based index of the swing within the clip, in time order. */
  swingIndex: number;
  /**
   * Which view the swing was filmed from, or null when it is not known.
   *
   * Null is not a defect to be defaulted away: several derived measurements are only
   * honest from one view, and a guessed `dtl` produces a confident wrong answer where a
   * null produces a flagged absent one.
   */
  cameraAngle: CameraAngle | null;
  /** Source frame size, px — the space every coordinate above lives in. */
  imageSize: { width: number; height: number };
  model: ShaftModelIdentity;
  /** The analysed frames, ascending in `tSec`. */
  frames: ShaftFrameSample[];
  /** ISO 8601, UTC — when the detector run that produced this finished. */
  producedAt: string;
  /** Build identity of the app that produced it, when the producer knew it. */
  appVersion?: string;
}

/** An empty `BodyReference` — every landmark absent. For producers and tests. */
export function emptyBodyReference(): BodyReference {
  return {
    leftShoulder: null,
    rightShoulder: null,
    leftHip: null,
    rightHip: null,
    leftWrist: null,
    rightWrist: null,
  };
}
