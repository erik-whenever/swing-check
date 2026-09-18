// ADAPTER — detector output + phases + pose landmarks → one `ShaftSwingSeries`.
//
// The seam is here and only here, so that `shaftSeries.ts` keeps no edge to the runtime
// at all. Both imports in this file are type-only and erase completely: nothing here
// pulls in `onnxruntime-web`, and the model's FILE NAME arrives as an argument rather
// than by importing `MODEL_FILE`, because importing that constant would drag the whole
// detector module — and with it the 12 MB checkpoint's loader — into every bundle that
// only wanted to reshape some numbers.
//
// When the detector is replaced, or the platform is (docs/oppna-fragor.md → F6), this
// is the file that gets rewritten. Everything above it reads `ShaftSwingSeries` and
// does not notice.

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ShaftDetection, ShaftPoint } from '../shaftDetector';
import { angleDeg } from './angles';
import {
  emptyBodyReference,
  type BodyReference,
  type MeasurementPhase,
  type PhaseSource,
  type Point2D,
  type ShaftFrameSample,
  type ShaftKeypoint,
  type ShaftSwingSeries,
} from './shaftSeries';

/**
 * MediaPipe's 33-landmark pose topology, for the six landmarks the measurements read.
 * Indices are fixed by the model, not by us.
 */
const LANDMARK_INDEX = {
  leftWrist: 15,
  rightWrist: 16,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

/**
 * Landmark visibility below which the landmark is treated as absent.
 *
 * MediaPipe reports a position for an occluded joint as readily as for a visible one,
 * and down-the-line occludes one whole side of the body. A hallucinated hip moves the
 * body-frame origin without moving any flag, which is the quiet failure this layer
 * exists to avoid — so a landmark the model is not confident about becomes a null the
 * measurements can see.
 */
export const MIN_LANDMARK_VISIBILITY = 0.5;

/** One analysed frame, as the caller has it: a time, a phase, and what ran on it. */
export interface DetectedFrame {
  /** Time within the CLIP, seconds. */
  tSec: number;
  phase: MeasurementPhase;
  /**
   * Where `phase` came from. NOT defaulted here, and that is the whole design: this
   * adapter cannot know whether its caller read the phase off an annotation or derived
   * it from an envelope, and a default would answer the question on the caller's behalf
   * in the direction that costs the most (see `PhaseSource`). The app's own path derives
   * every phase, so it passes `envelope-impact` or `envelope-fallback` — never
   * `observed`.
   */
  phaseSource: PhaseSource;
  detection: ShaftDetection;
  /**
   * The 33 MediaPipe landmarks for this frame in NORMALISED coordinates, or null/absent
   * when no pose was detected. Scaled to `detection.imageSize` here, so that every
   * coordinate in the series lives in one pixel space.
   */
  landmarks?: readonly NormalizedLandmark[] | null;
}

/** What the caller knows about the swing that the detector does not. */
export interface SeriesIdentity {
  clipName: string;
  swingIndex: number;
  /** Null when nobody has established the view. Never guessed — see `ShaftSwingSeries`. */
  cameraAngle: ShaftSwingSeries['cameraAngle'];
  /** The checkpoint's file name, e.g. `MODEL_FILE` at the call site. */
  modelFile: string;
  /** ISO 8601, UTC. Defaults to now; passed explicitly by anything that wants to be pure. */
  producedAt?: string;
  appVersion?: string;
}

/**
 * Build a series from the frames of ONE swing, in time order.
 *
 * Throws on an empty list or on frames whose detections disagree about the image size:
 * both are producer bugs rather than data conditions, and a series whose coordinates
 * silently live in two pixel spaces is worse than a loud failure. Everything that is a
 * DATA condition — a missing point, a low confidence, a swapped end — is not an error
 * here; it is the plausibility check's job, and it arrives there flagged.
 */
export function buildShaftSwingSeries(
  frames: readonly DetectedFrame[],
  identity: SeriesIdentity,
): ShaftSwingSeries {
  if (frames.length === 0) {
    throw new Error('buildShaftSwingSeries: no frames — a swing with no frames is not a series');
  }

  const imageSize = frames[0].detection.imageSize;
  for (const f of frames) {
    if (
      f.detection.imageSize.width !== imageSize.width ||
      f.detection.imageSize.height !== imageSize.height
    ) {
      throw new Error(
        'buildShaftSwingSeries: frames disagree about image size ' +
          `(${imageSize.width}×${imageSize.height} vs ` +
          `${f.detection.imageSize.width}×${f.detection.imageSize.height}) — ` +
          'one series carries one pixel space',
      );
    }
  }

  const ordered = [...frames].sort((a, b) => a.tSec - b.tSec);

  return {
    clipName: identity.clipName,
    swingIndex: identity.swingIndex,
    cameraAngle: identity.cameraAngle,
    imageSize: { ...imageSize },
    model: {
      file: identity.modelFile,
      keypoints: ordered[0].detection.modelKeypoints,
      provider: ordered[0].detection.provider,
    },
    frames: ordered.map(toSample),
    producedAt: identity.producedAt ?? new Date().toISOString(),
    ...(identity.appVersion === undefined ? {} : { appVersion: identity.appVersion }),
  };
}

function toSample(frame: DetectedFrame): ShaftFrameSample {
  const { detection } = frame;
  const butt = toKeypoint(detection.butt);
  const hosel = toKeypoint(detection.hosel);
  const toe = toKeypoint(detection.toe);
  const heel = toKeypoint(detection.heel);
  return {
    tSec: frame.tSec,
    phase: frame.phase,
    phaseSource: frame.phaseSource,
    butt,
    hosel,
    toe,
    heel,
    // Directed, and in the schema's order: `butt → hosel`, `heel → toe`. The two
    // directions are the whole reason a swapped end is detectable downstream.
    shaftAngleDeg: butt && hosel ? angleDeg(butt, hosel) : null,
    bladeAngleDeg: heel && toe ? angleDeg(heel, toe) : null,
    body: toBodyReference(frame.landmarks ?? null, detection.imageSize),
  };
}

function toKeypoint(p: ShaftPoint | null): ShaftKeypoint | null {
  return p ? { x: p.x, y: p.y, conf: p.conf } : null;
}

/** Normalised landmarks → the six the measurements read, in image pixels. */
function toBodyReference(
  landmarks: readonly NormalizedLandmark[] | null,
  imageSize: { width: number; height: number },
): BodyReference | null {
  if (!landmarks || landmarks.length === 0) return null;
  const out = emptyBodyReference();
  for (const [name, index] of Object.entries(LANDMARK_INDEX)) {
    out[name as keyof BodyReference] = toPixel(landmarks[index], imageSize);
  }
  return out;
}

function toPixel(
  landmark: NormalizedLandmark | undefined,
  imageSize: { width: number; height: number },
): Point2D | null {
  if (!landmark) return null;
  // `visibility` is optional in the type and absent in some builds; an absent score is
  // treated as visible, because the alternative is discarding every landmark there.
  const visibility = landmark.visibility;
  if (visibility !== undefined && visibility < MIN_LANDMARK_VISIBILITY) return null;
  return { x: landmark.x * imageSize.width, y: landmark.y * imageSize.height };
}
