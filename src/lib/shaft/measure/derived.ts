// DERIVED MEASUREMENTS — the five quantities that are honest in 2D from two shaft
// points, and nothing beyond them.
//
// EVERY MEASUREMENT CARRIES ITS OWN PRECONDITIONS AS DATA. `MEASUREMENT_ASSUMPTIONS` is
// a table, not a paragraph: which camera angle a value is only valid from, whether it
// is a projection rather than the 3D quantity a reader will assume it is, which
// keypoints and which body landmarks it leans on, whether it needs to know which way
// round the player stands. A consumer can read that table; a consumer cannot read a
// comment. This is the whole reason the assumptions live in the type and not above it.
//
// PROJECTION IS THE DEFAULT, NOT THE EXCEPTION. Four of the five values below are
// projections of a 3D quantity onto the image plane. A projected shaft angle is not the
// shaft angle — it is the shaft angle as seen from where the phone happened to be
// standing, and it changes when the phone moves even though the swing did not. Saying
// so in `projection: true` and `projectionOf` is what keeps a rule from quietly
// treating it as the real thing.
//
// WHAT IS NOT HERE, AND WHY:
//
//   BLADE ANGLE. Measured, flagged, carried in the raw layer — and deliberately not
//   exposed. Three independent findings, all measured: the sole points reach a maximum
//   confidence of 0.55 against 0.99–1.00 for the shaft points and sit at a median of
//   0.26; the angle moves at 71–78 °/s against the shaft's 12 °/s on dense time steps,
//   a ratio of about 6 on two vectors bolted to the same rigid body; and `toe`/`heel`
//   swap ends between neighbouring frames, throwing 150–180° jumps. A measurement that
//   fails all three is not a weak signal to be used with care, it is noise with a unit.
//   `plausibility.ts` keeps measuring it so the day a four-point checkpoint lands, the
//   numbers say whether it is better. Full argument: docs/shaft/datamodell.md.
//
//   CLUBFACE ANGLE, CLUB PATH IN DEGREES IN-TO-OUT, ANGLE OF ATTACK. Not weak — absent.
//   Two points on a line carry no roll about that line, and a single camera carries no
//   depth. No threshold and no better checkpoint changes that; it is geometry.
//   docs/shaft/datamodell.md → *Vad som inte går att härleda*.

import type { CameraAngle } from '../../cameraAngle';
import {
  circularMedianDeg,
  distance,
  lineOrientationDeg,
  principalAxisFit,
} from './angles';
import {
  usableFrameIndices,
  type CheckedShaftSwingSeries,
  type QualityLevel,
  type QualityReason,
} from './plausibility';
import type {
  BodyLandmarkName,
  BodyReference,
  MeasurementPhase,
  Point2D,
  ShaftFrameSample,
  ShaftKeypointName,
  ShaftModelIdentity,
} from './shaftSeries';
import { MEASUREMENT_PHASES, isPhaseObserved } from './shaftSeries';

// ── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Half-width of the band around the reference direction inside which the club at the
 * top is called neither across-the-line nor laid-off.
 *
 * 10° is a judgement, not a measurement: it is roughly the spread the shaft angle shows
 * across the `top` frames of one swing (the top is a turnaround, not an instant, and
 * which frame is called `top` moves the reading), so a band narrower than that would
 * label the same swing differently depending on frame selection.
 */
export const ON_PLANE_BAND_DEG = 10;

/**
 * How near the vertical the shaft may sit at the top before the across/laid-off call is
 * refused outright — degrees from the vertical, measured on the undirected shaft line.
 *
 * WHY THIS GATE EXISTS. `lineOrientationDeg` folds at ±90°, so a shaft that passes the
 * vertical changes this measurement's sign with no warning and no flag. That was written
 * down as the standing weakness of `ACROSS_THE_LINE_SIGN` when the sign was verified
 * against a single frame (S-21); this constant is what closes it.
 *
 * WHY 16, AND WHY IT IS NOT A POINT ESTIMATE. From the blind judging round in
 * `docs/shaft/across-sign-result.md`: twelve down-the-line tops were read by eye with the
 * computed values hidden. The eye stopped being able to call a direction somewhere
 * between **10,9° and 16,1° from the vertical**, and — this is the part that matters —
 * there is **no clean cut**. 16,1° from vertical appears on BOTH sides of the eye's own
 * boundary: one frame at that tilt was called `laid-off`, another was refused. What
 * separates them is the frame's own clarity (clubhead visibility, blur, how much of the
 * target line is in shot), not the angle. So no threshold reproduces the eye, and a
 * threshold in the middle of the overlap would only look precise.
 *
 * 16 is therefore the TOP of the measured overlap, rounded down to a whole degree, and it
 * is chosen deliberately wide. The two errors are not symmetric: refusing a call that
 * could have been made costs the golfer one missing hint, while making a call on the
 * wrong side of the fold tells them the opposite of the truth about their own swing.
 * Conservative here means MORE `cannot-determine`, not fewer — so the gate is set at the
 * far edge of the zone where a human could still sometimes read it, not at the near edge
 * where a human always could.
 *
 * WHAT IT IS NOT. It is not derived from `ON_PLANE_BAND_DEG`, which is measured from the
 * HORIZONTAL and is untouched by this: the two bands sit at opposite ends of the same
 * scale and answer different questions. And it rests on **one round, one observer, eleven
 * judged frames** — a second round, another pair of eyes, or a left-handed frame could
 * move it. The overlap it was read off is in the report, so the next person can disagree
 * with the number without re-running the judging.
 */
export const NEAR_VERTICAL_GATE_DEG = 16;

/**
 * Fewest clubhead positions a plane fit is allowed to run on. Two points define a line
 * exactly and tell you nothing about whether the cloud was line-like, which is half of
 * what the fit is for.
 */
export const MIN_PLANE_POINTS = 3;

/**
 * Which way a positive on-screen tilt at the top reads, per handedness: for a
 * right-handed player filmed down-the-line, a shaft line tilting anticlockwise on
 * screen at the top is across-the-line, and the mirror for a left-hander.
 *
 * VERIFIED AGAINST ONE FRAME, AND THAT ONE FRAME IS THE WHOLE EVIDENCE.
 * `049-88216ea7_s00_f05` (batch-03, `dtl`, right-handed) is a top of the backswing that
 * Erik read by eye as *slightly across the line* — the shaft points a little right of
 * the target line seen from behind. Run through the production path
 * (`buildShaftSwingSeries` → `checkShaftSeries` → `buildShaftMeasurements`) it puts the
 * grip at (126.0, 194.8) and the hosel at (155.5, 67.0): the club end is up and to the
 * RIGHT of the grip on screen, `lineOrientationDeg` = +77.0°. With the table below that
 * comes out `across-the-line`, the same label the eye gave it, so the table stands.
 * `derived.test.ts` pins it on those coordinates and on their mirror image — flip this
 * table and the suite fails.
 *
 * WHAT ONE FRAME DOES NOT SETTLE. It fixes the sign and nothing else:
 *
 *   - The reference shaft sits 77° from the image horizontal, i.e. 13° from the fold at
 *     ±90° that `lineOrientationDeg` performs. A top whose shaft passes the vertical
 *     changes this measurement's sign with no warning, and the reference is one of the
 *     near-vertical tops — it constrains the sign from the weakest end of the range.
 *   - No laid-off frame has been read by eye at all. That half of the split is the
 *     mirror of the verified half by construction, not by observation. The same goes for
 *     left-handed play: mirrored, never measured.
 *   - `ON_PLANE_BAND_DEG` is untouched by this. The reference lands at 77°, nowhere near
 *     the band, so it says nothing about where the band belongs.
 *
 * What would strengthen it: a hand-read across-the-line top whose shaft is nearer the
 * horizontal (away from the fold), a hand-read laid-off top, and one left-handed frame.
 * Re-open the question against the same reference — the frame is in batch-03 and the
 * numbers above are what the current path produces for it.
 */
export const ACROSS_THE_LINE_SIGN: Record<Handedness, 1 | -1> = { right: 1, left: -1 };

// ── Shapes ───────────────────────────────────────────────────────────────────

/**
 * Which way round the player stands. NOT derivable from the pose landmarks' `left`/
 * `right` — those are the subject's own sides and are the same for both handednesses.
 * Supplied by the caller, or null when nobody has said.
 */
export type Handedness = 'right' | 'left';

export type MeasurementId =
  | 'shaft-angle-by-phase'
  | 'shaft-position-p2'
  | 'shaft-position-p4'
  | 'top-shaft-orientation'
  | 'clubhead-path'
  | 'swing-plane-tilt';

/** What a value is expressed in. `torso-lengths` is the body-relative unit below. */
export type MeasurementUnit =
  | 'deg'
  | 'deg-from-horizontal'
  | 'torso-lengths'
  | 'category'
  | 'mixed';

/** Reasons a derived value can be absent or soft, on top of the frame-level ones. */
export type DerivedReason =
  /** The series does not say which view it was filmed from. */
  | 'camera-angle-unknown'
  /** The series says a view this measurement is not valid from. */
  | 'camera-angle-mismatch'
  /** The measurement needs handedness and nobody supplied it. */
  | 'handedness-unknown'
  /** No frame in the series carries the phase this measurement is defined at. */
  | 'phase-missing'
  /**
   * A frame carries `top`, but nothing OBSERVED the top — the label is derived from the
   * swing envelope (`PhaseSource` in `shaftSeries.ts`), and S-23 measured that label
   * wrong on 13 of the 22 frames the production path picked
   * (docs/shaft/phase-audit/resultat.md). Distinct from `phase-missing`: the frame is
   * there and the measurement could be computed on it — what is absent is any reason to
   * believe it is the top. Until a reliable source exists, a number anchored at the top
   * would be a number about an arbitrary frame, so none is returned.
   */
  | 'top-phase-not-observed'
  /** No frame the measurement could use carries the body landmarks it needs. */
  | 'body-reference-missing'
  /**
   * The shaft sat within `NEAR_VERTICAL_GATE_DEG` of the vertical at the top, where
   * `lineOrientationDeg`'s fold at ±90° flips the sign without warning. Distinct from the
   * other ways this measurement declines — the view, the confidence, a missing frame —
   * because this one is a property of the SWING, not of the recording or the detector:
   * nothing about the footage could be improved to make this frame answerable.
   */
  | 'top-shaft-near-vertical'
  /** Fewer frames survived than the measurement needs. */
  | 'insufficient-frames';

export type MeasurementReason = QualityReason | DerivedReason;

export interface MeasurementQualityFlag {
  level: QualityLevel;
  reasons: MeasurementReason[];
}

/**
 * What a measurement takes for granted. Read it before reading the value.
 *
 * `cameraAngle: 'any'` does NOT mean the value means the same thing from both views —
 * it means the value is computable from both and the reader must interpret it in light
 * of which. Where a view genuinely invalidates a measurement, the field names the one
 * view it holds from and the value comes back null from the other.
 */
export interface MeasurementAssumptions {
  cameraAngle: CameraAngle | 'any';
  /** True when this is a 2D projection of a 3D quantity, not the 3D quantity. */
  projection: boolean;
  /** The 3D quantity it projects, named. Null when the value is natively 2D. */
  projectionOf: string | null;
  requiresPoints: readonly ShaftKeypointName[];
  requiresBody: readonly BodyLandmarkName[];
  requiresHandedness: boolean;
  /** Phases at least one frame must carry. Empty when the measurement spans the swing. */
  requiresPhases: readonly MeasurementPhase[];
}

/** A derived value, its flag, and what it assumed to exist. */
export interface Measurement<T> {
  id: MeasurementId;
  /** Null whenever the flag is `rejected`, and possibly null otherwise. */
  value: T | null;
  unit: MeasurementUnit;
  quality: MeasurementQualityFlag;
  assumes: MeasurementAssumptions;
  /** Indices into `ShaftSwingSeries.frames` that produced the value. */
  frameIndices: number[];
}

/**
 * THE ASSUMPTION TABLE. Every precondition of every derived measurement, as data.
 *
 * The `butt`/`hosel` pair appears on all six and `toe`/`heel` on none — that is the
 * blade decision, visible in the model rather than only argued in a document.
 */
export const MEASUREMENT_ASSUMPTIONS: Record<MeasurementId, MeasurementAssumptions> = {
  'shaft-angle-by-phase': {
    cameraAngle: 'any',
    projection: true,
    projectionOf: "the shaft's direction in space",
    requiresPoints: ['butt', 'hosel'],
    requiresBody: [],
    requiresHandedness: false,
    requiresPhases: [],
  },
  'shaft-position-p2': {
    // P2 is "shaft parallel to the ground" — a 3D event that only reads cleanly as a
    // near-horizontal shaft from down-the-line. Face-on foreshortens the same instant.
    cameraAngle: 'dtl',
    projection: true,
    projectionOf: "the club's position relative to the body at P2",
    requiresPoints: ['butt', 'hosel'],
    requiresBody: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    requiresHandedness: false,
    requiresPhases: ['backswing'],
  },
  'shaft-position-p4': {
    cameraAngle: 'dtl',
    projection: true,
    projectionOf: "the club's position relative to the body at the top",
    requiresPoints: ['butt', 'hosel'],
    requiresBody: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    requiresHandedness: false,
    requiresPhases: ['top'],
  },
  'top-shaft-orientation': {
    cameraAngle: 'dtl',
    projection: true,
    projectionOf: "the shaft's direction relative to the target line at the top",
    requiresPoints: ['butt', 'hosel'],
    requiresBody: [],
    requiresHandedness: true,
    requiresPhases: ['top'],
  },
  'clubhead-path': {
    cameraAngle: 'any',
    projection: true,
    projectionOf: "the clubhead's path through space",
    requiresPoints: ['hosel'],
    requiresBody: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    requiresHandedness: false,
    requiresPhases: [],
  },
  'swing-plane-tilt': {
    cameraAngle: 'any',
    projection: true,
    projectionOf: 'the swing plane',
    requiresPoints: ['hosel'],
    requiresBody: ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'],
    requiresHandedness: false,
    requiresPhases: ['backswing', 'downswing'],
  },
};

/** One phase's shaft angle, and how much it rests on. */
export interface PhaseShaftAngle {
  /**
   * Circular median of the DIRECTED `butt → hosel` angle over the phase's frames,
   * degrees, image convention. A medoid, never an arithmetic mean — see
   * `circularMedianDeg`.
   */
  medianDeg: number;
  /** How many frames contributed. */
  n: number;
  /** `usable` only when every contributing frame was `usable`. */
  level: QualityLevel;
}

export type ShaftAngleByPhase = Partial<Record<MeasurementPhase, PhaseShaftAngle>>;

/**
 * A point in the BODY FRAME: origin at the mid-hip, both axes scaled by the torso
 * length (mid-shoulder to mid-hip), y still growing downward.
 *
 * ONE ISOTROPIC SCALE, AND IT IS THE TORSO — not the shoulder width. Shoulder width is
 * the obvious choice and is wrong here: down-the-line shows the shoulders nearly
 * edge-on, so the width collapses toward zero and the normalisation explodes on exactly
 * the view most of these measurements are defined from. The torso length survives both
 * views. The axes are the IMAGE's, not the body's — rotating them onto the shoulder
 * line would fold camera roll into every value.
 */
export interface BodyFramePoint {
  /** Horizontal offset from the mid-hip, in torso lengths. Image-right is positive. */
  u: number;
  /** Vertical offset from the mid-hip, in torso lengths. Image-DOWN is positive. */
  v: number;
}

/** Where the shaft sat relative to the body at one instant. */
export interface BodyRelativeShaft {
  frameIndex: number;
  tSec: number;
  butt: BodyFramePoint;
  hosel: BodyFramePoint;
  /** The shaft LINE's tilt from the image horizontal, (-90, 90], anticlockwise up. */
  orientationDeg: number;
}

/**
 * `cannot-determine` is a RESULT, not a failure: the frame was measured, and what the
 * measurement found is that this top cannot be called either way. It is reached only
 * through `NEAR_VERTICAL_GATE_DEG`, and the reason `top-shaft-near-vertical` always
 * travels with it, so it never has to be told apart from a missing value by guesswork.
 */
export type TopShaftCategory = 'across-the-line' | 'on-plane' | 'laid-off' | 'cannot-determine';

export interface TopShaftOrientation {
  category: TopShaftCategory;
  /**
   * Signed deviation from the image horizontal at the top, degrees, already turned the
   * right way round for the player's handedness. Positive is across-the-line under the
   * convention in `ACROSS_THE_LINE_SIGN`.
   *
   * The reference is the image horizontal, because that is what the target line
   * projects to in a down-the-line frame. That is an approximation: it assumes the
   * phone is roughly level and roughly on the target line. Both are stated, neither is
   * measured.
   *
   * NULL WHEN THE CATEGORY IS `cannot-determine`, and null in the type rather than
   * absent by convention: the near-vertical gate runs BEFORE the sign is computed, so
   * there is no signed deviation to report — not a hidden one, none. A consumer that
   * wants to know how near the vertical the shaft sat reads `distanceToVerticalDeg`,
   * which carries no direction and therefore cannot be mistaken for the call.
   */
  deviationDeg: number | null;
  /**
   * How far the shaft LINE sat from the vertical at the top, degrees, unsigned, 0–90.
   * Always present, including on the calls that were made — it is what the gate tests,
   * and a reader who wants to see how close to the fold a given call sat needs it.
   */
  distanceToVerticalDeg: number;
  frameIndex: number;
}

export interface ClubheadPathPoint extends BodyFramePoint {
  frameIndex: number;
  tSec: number;
  phase: MeasurementPhase;
}

/**
 * The clubhead's track through the frame, in body units.
 *
 * THE POINT IS THE HOSEL, NOT THE HEAD. The sole points are the head's own extent and
 * they are the measurement this layer does not trust. The hosel is the bottom of the
 * shaft, it is located at 0.99–1.00 confidence, and it does not move when the face
 * rotates — which is why the annotation spec chose it over the head's centre in the
 * first place. It is offset from the true clubhead by roughly half a head length, a
 * constant bias that a shape comparison does not care about and an absolute position
 * would.
 */
export type ClubheadPath = ClubheadPathPoint[];

export interface PlaneFit {
  /** Tilt of the fitted axis from the image horizontal, (-90, 90], anticlockwise up. */
  tiltDeg: number;
  /** RMS perpendicular distance from the points to that axis, in torso lengths. */
  rmsResidualTorsoLengths: number;
  n: number;
}

/**
 * The swing plane as a projection — two line fits through the clubhead path.
 *
 * A plane in space projects to a line in the image only when the camera lies in it.
 * It never exactly does, so `rmsResidualTorsoLengths` is not a nuisance term: it is how
 * far from line-like the projected path actually was, and a large one means the tilt
 * describes a curve rather than a plane.
 */
export interface SwingPlaneTilt {
  backswing: PlaneFit | null;
  downswing: PlaneFit | null;
}

/** Everything derivable about one swing, with the check that admitted it. */
export interface ShaftMeasurementSet {
  clipName: string;
  swingIndex: number;
  cameraAngle: CameraAngle | null;
  model: ShaftModelIdentity;
  handedness: Handedness | null;
  shaftAngleByPhase: Measurement<ShaftAngleByPhase>;
  shaftPositionAtP2: Measurement<BodyRelativeShaft>;
  shaftPositionAtP4: Measurement<BodyRelativeShaft>;
  topShaftOrientation: Measurement<TopShaftOrientation>;
  clubheadPath: Measurement<ClubheadPath>;
  swingPlaneTilt: Measurement<SwingPlaneTilt>;
}

export interface MeasurementOptions {
  /** Null (the default) is honest: measurements needing it come back flagged, not guessed. */
  handedness?: Handedness | null;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Derive every measurement this layer is willing to stand behind.
 *
 * Takes a `CheckedShaftSwingSeries` and nothing else, so there is no path from raw
 * detector output to a rule that skips the plausibility check.
 */
export function buildShaftMeasurements(
  checked: CheckedShaftSwingSeries,
  options: MeasurementOptions = {},
): ShaftMeasurementSet {
  const handedness = options.handedness ?? null;
  const { series } = checked;

  return {
    clipName: series.clipName,
    swingIndex: series.swingIndex,
    cameraAngle: series.cameraAngle,
    model: series.model,
    handedness,
    shaftAngleByPhase: shaftAngleByPhase(checked),
    shaftPositionAtP2: shaftPositionAtP2(checked),
    shaftPositionAtP4: shaftPositionAtP4(checked),
    topShaftOrientation: topShaftOrientation(checked, handedness),
    clubheadPath: clubheadPath(checked),
    swingPlaneTilt: swingPlaneTilt(checked),
  };
}

// ── 1. Shaft angle per phase ─────────────────────────────────────────────────

function shaftAngleByPhase(checked: CheckedShaftSwingSeries): Measurement<ShaftAngleByPhase> {
  const id: MeasurementId = 'shaft-angle-by-phase';
  const { series, quality } = checked;
  const usable = usableFrameIndices(checked, 'shaft');
  const gate = cameraGate(id, series.cameraAngle);

  if (usable.length === 0) {
    return reject(id, 'deg', [...gate.reasons, 'no-usable-frames'], []);
  }

  const out: ShaftAngleByPhase = {};
  const used: number[] = [];
  // THE `top` BUCKET IS GATED, AND ONLY THAT ONE. This measurement reads `frame.phase`
  // directly and never goes through `topFrame`, so the rule S-23 forced on the
  // top-anchored measurements has to be applied here too or it is trivially routed
  // around: `shaftAngleByPhase(...).value.top.medianDeg` is the same number
  // `top-shaft-orientation` refuses to give. Every other bucket is a SPAN the labelling
  // gets roughly right over several frames, and none of them was measured in S-23 —
  // gating them would be an untested guess dressed as caution.
  let unobservedTops = false;
  for (const phase of MEASUREMENT_PHASES) {
    let indices = usable.filter((i) => series.frames[i].phase === phase);
    if (phase === 'top') {
      const observed = indices.filter((i) => isPhaseObserved(series.frames[i].phaseSource));
      unobservedTops = observed.length < indices.length;
      indices = observed;
    }
    if (indices.length === 0) continue;
    const angles = indices
      .map((i) => series.frames[i].shaftAngleDeg)
      .filter((a): a is number => a !== null);
    const medianDeg = circularMedianDeg(angles);
    if (medianDeg === null) continue;
    const allUsable = indices.every((i) => quality.frames[i].shaftAngle.level === 'usable');
    out[phase] = { medianDeg, n: indices.length, level: allUsable ? 'usable' : 'uncertain' };
    used.push(...indices);
  }

  if (used.length === 0) {
    const why: MeasurementReason[] = [...gate.reasons, 'no-usable-frames'];
    if (unobservedTops) why.push('top-phase-not-observed');
    return reject(id, 'deg', why, []);
  }

  const soft = Object.values(out).some((p) => p.level !== 'usable');
  const reasons = [...gate.reasons];
  if (soft) reasons.push('sparse-usable-frames');
  // The bucket is absent rather than present-and-wrong, and the reason says which of the
  // two absences this is: no `top` frame in the swing, or `top` frames nobody observed.
  if (unobservedTops) reasons.push('top-phase-not-observed');
  return {
    id,
    value: out,
    unit: 'deg',
    quality: { level: worst(gate.level, soft ? 'uncertain' : 'usable'), reasons },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices: used,
  };
}

// ── 2 & 3. Shaft position relative to the body at P2 and P4 ──────────────────

/**
 * P2 — the club shaft parallel to the ground on the way back.
 *
 * Found as the BACKSWING frame whose shaft line sits closest to the image horizontal.
 * The backswing crosses horizontal exactly once, so the minimum is the crossing and not
 * an arbitrary pick; `top` is excluded from the search precisely because the shaft
 * passes near horizontal again there and the two would compete.
 *
 * This is a projected P2, not P2: parallel-to-the-ground is a 3D condition, and what is
 * being located is the frame where its projection is closest to satisfied. From
 * face-on the same instant is foreshortened, which is why the measurement is
 * down-the-line only.
 */
function shaftPositionAtP2(checked: CheckedShaftSwingSeries): Measurement<BodyRelativeShaft> {
  const id: MeasurementId = 'shaft-position-p2';
  const { series } = checked;
  const gate = cameraGate(id, series.cameraAngle);
  if (gate.level === 'rejected') {
    return reject(id, 'torso-lengths', gate.reasons, []);
  }

  const candidates = usableFrameIndices(checked, 'shaft').filter(
    (i) => series.frames[i].phase === 'backswing',
  );
  if (candidates.length === 0) {
    return reject(id, 'torso-lengths', [...gate.reasons, 'phase-missing'], []);
  }

  let bestIndex: number | null = null;
  let bestTilt = Infinity;
  for (const i of candidates) {
    const tilt = shaftOrientation(series.frames[i]);
    if (tilt === null) continue;
    if (Math.abs(tilt) < bestTilt) {
      bestTilt = Math.abs(tilt);
      bestIndex = i;
    }
  }
  if (bestIndex === null) {
    return reject(id, 'torso-lengths', [...gate.reasons, 'insufficient-frames'], []);
  }
  return bodyRelativeMeasurement(id, checked, bestIndex, gate);
}

/**
 * P4 — the top of the backswing.
 *
 * The last frame an OBSERVED phase labelling calls `top`, not the first and not the one
 * with the highest hands: the top is a turnaround the labelling already located, and
 * picking the last of its frames puts the reading as close to the transition as the
 * labelling allows without re-deriving the event here.
 *
 * When no frame's `top` was observed the measurement returns nothing — see `topFrame`.
 * P4 is defined AT an event, so a frame that is not that event does not give a rough P4;
 * it gives a precise reading of some other moment.
 */
function shaftPositionAtP4(checked: CheckedShaftSwingSeries): Measurement<BodyRelativeShaft> {
  const id: MeasurementId = 'shaft-position-p4';
  const gate = cameraGate(id, checked.series.cameraAngle);
  if (gate.level === 'rejected') {
    return reject(id, 'torso-lengths', gate.reasons, []);
  }
  const top = topFrame(checked);
  if (top.index === null) {
    return reject(id, 'torso-lengths', [...gate.reasons, top.why!], top.topIndices);
  }
  return bodyRelativeMeasurement(id, checked, top.index, gate);
}

function bodyRelativeMeasurement(
  id: MeasurementId,
  checked: CheckedShaftSwingSeries,
  frameIndex: number,
  gate: Gate,
): Measurement<BodyRelativeShaft> {
  const frame = checked.series.frames[frameIndex];
  const body = bodyFrame(frame.body);
  const orientation = shaftOrientation(frame);
  if (!body || !frame.butt || !frame.hosel || orientation === null) {
    return reject(id, 'torso-lengths', [...gate.reasons, 'body-reference-missing'], [frameIndex]);
  }

  const frameLevel = checked.quality.frames[frameIndex].shaftAngle.level;
  const reasons = [...gate.reasons, ...checked.quality.frames[frameIndex].shaftAngle.reasons];
  return {
    id,
    value: {
      frameIndex,
      tSec: frame.tSec,
      butt: toBodyFrame(body, frame.butt),
      hosel: toBodyFrame(body, frame.hosel),
      orientationDeg: orientation,
    },
    unit: 'torso-lengths',
    quality: { level: worst(gate.level, frameLevel), reasons },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices: [frameIndex],
  };
}

// ── 4. Across-the-line vs laid-off ───────────────────────────────────────────

function topShaftOrientation(
  checked: CheckedShaftSwingSeries,
  handedness: Handedness | null,
): Measurement<TopShaftOrientation> {
  const id: MeasurementId = 'top-shaft-orientation';
  const gate = cameraGate(id, checked.series.cameraAngle);
  if (gate.level === 'rejected') return reject(id, 'category', gate.reasons, []);
  if (handedness === null) {
    return reject(id, 'category', [...gate.reasons, 'handedness-unknown'], []);
  }

  const top = topFrame(checked);
  if (top.index === null) {
    return reject(id, 'category', [...gate.reasons, top.why!], top.topIndices);
  }
  const index = top.index;
  const orientation = shaftOrientation(checked.series.frames[index]);
  if (orientation === null) {
    return reject(id, 'category', [...gate.reasons, 'insufficient-frames'], [index]);
  }

  // Held below `usable` on its own account until 2026-09-17, while the sign convention
  // in `ACROSS_THE_LINE_SIGN` was only stated. It is now verified against hand-read
  // frames, so the category carries the camera gate and the frame's own flag like every
  // other value here, and nothing more.
  const reasons: MeasurementReason[] = [
    ...gate.reasons,
    ...checked.quality.frames[index].shaftAngle.reasons,
  ];
  const level = worst(gate.level, checked.quality.frames[index].shaftAngle.level);
  const distanceToVerticalDeg = 90 - Math.abs(orientation);

  // THE NEAR-VERTICAL GATE, AND IT RUNS FIRST. Inside `NEAR_VERTICAL_GATE_DEG` of the
  // vertical the sign is not weak evidence, it is no evidence: `lineOrientationDeg` folds
  // at ±90°, so a shaft a hair either side of vertical reads as a confident opposite. The
  // deviation is therefore never computed here rather than computed and then suppressed —
  // a suppressed number is one refactor away from being read.
  if (distanceToVerticalDeg <= NEAR_VERTICAL_GATE_DEG) {
    return {
      id,
      value: {
        category: 'cannot-determine',
        deviationDeg: null,
        distanceToVerticalDeg,
        frameIndex: index,
      },
      unit: 'category',
      // Not downgraded on the gate's account: "this cannot be called" is a reliable
      // finding about the swing, not a doubt about the measurement. The level still
      // carries whatever the camera gate and the frame's own flag said, and the reason
      // below is what separates this from every other way the value can come back empty.
      quality: { level, reasons: [...reasons, 'top-shaft-near-vertical'] },
      assumes: MEASUREMENT_ASSUMPTIONS[id],
      frameIndices: [index],
    };
  }

  const deviationDeg = ACROSS_THE_LINE_SIGN[handedness] * orientation;
  const category: TopShaftCategory =
    deviationDeg > ON_PLANE_BAND_DEG
      ? 'across-the-line'
      : deviationDeg < -ON_PLANE_BAND_DEG
        ? 'laid-off'
        : 'on-plane';

  return {
    id,
    value: { category, deviationDeg, distanceToVerticalDeg, frameIndex: index },
    unit: 'category',
    quality: { level, reasons },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices: [index],
  };
}

// ── 5. Clubhead path in the image ────────────────────────────────────────────

function clubheadPath(checked: CheckedShaftSwingSeries): Measurement<ClubheadPath> {
  const id: MeasurementId = 'clubhead-path';
  const { series } = checked;
  const gate = cameraGate(id, series.cameraAngle);

  const path: ClubheadPath = [];
  const used: number[] = [];
  let anyBodyMissing = false;
  for (const i of usableFrameIndices(checked, 'shaft')) {
    const frame = series.frames[i];
    const body = bodyFrame(frame.body);
    if (!body || !frame.hosel) {
      anyBodyMissing = true;
      continue;
    }
    path.push({ frameIndex: i, tSec: frame.tSec, phase: frame.phase, ...toBodyFrame(body, frame.hosel) });
    used.push(i);
  }

  if (path.length === 0) {
    const why: MeasurementReason = anyBodyMissing ? 'body-reference-missing' : 'no-usable-frames';
    return reject(id, 'torso-lengths', [...gate.reasons, why], []);
  }

  const reasons = [...gate.reasons];
  if (anyBodyMissing) reasons.push('body-reference-missing');
  return {
    id,
    value: path,
    unit: 'torso-lengths',
    quality: { level: worst(gate.level, anyBodyMissing ? 'uncertain' : 'usable'), reasons },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices: used,
  };
}

// ── 6. Swing plane tilt, as a projection ─────────────────────────────────────

function swingPlaneTilt(checked: CheckedShaftSwingSeries): Measurement<SwingPlaneTilt> {
  const id: MeasurementId = 'swing-plane-tilt';
  const gate = cameraGate(id, checked.series.cameraAngle);
  const path = clubheadPath(checked);
  if (!path.value) {
    return reject(id, 'deg-from-horizontal', [...gate.reasons, ...path.quality.reasons], []);
  }

  const backswing = fitPhase(path.value, 'backswing');
  const downswing = fitPhase(path.value, 'downswing');
  if (!backswing && !downswing) {
    return reject(id, 'deg-from-horizontal', [...gate.reasons, 'insufficient-frames'], []);
  }

  const used = path.value
    .filter((p) => p.phase === 'backswing' || p.phase === 'downswing')
    .map((p) => p.frameIndex);
  const partial = !backswing || !downswing;
  const reasons = [...gate.reasons];
  if (partial) reasons.push('insufficient-frames');
  return {
    id,
    value: { backswing, downswing },
    unit: 'deg-from-horizontal',
    quality: {
      level: worst(worst(gate.level, path.quality.level), partial ? 'uncertain' : 'usable'),
      reasons,
    },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices: used,
  };
}

function fitPhase(path: ClubheadPath, phase: MeasurementPhase): PlaneFit | null {
  const points: Point2D[] = path.filter((p) => p.phase === phase).map((p) => ({ x: p.u, y: p.v }));
  if (points.length < MIN_PLANE_POINTS) return null;
  const fit = principalAxisFit(points);
  if (!fit) return null;
  return { tiltDeg: fit.tiltDeg, rmsResidualTorsoLengths: fit.rmsResidual, n: points.length };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

interface Gate {
  level: QualityLevel;
  reasons: MeasurementReason[];
}

/**
 * Apply a measurement's camera-angle precondition.
 *
 * A MISMATCH AND AN UNKNOWN ARE NOT THE SAME FAILURE. Knowing the clip is face-on when
 * the measurement holds only down-the-line means the value would be wrong, so it is
 * rejected. Not knowing means it might be right, so the value is computed and marked
 * `uncertain`. Collapsing the two would either throw away half the usable clips or
 * ship known-wrong numbers.
 */
function cameraGate(id: MeasurementId, angle: CameraAngle | null): Gate {
  const want = MEASUREMENT_ASSUMPTIONS[id].cameraAngle;
  if (want === 'any') return { level: 'usable', reasons: [] };
  if (angle === null) return { level: 'uncertain', reasons: ['camera-angle-unknown'] };
  if (angle !== want) return { level: 'rejected', reasons: ['camera-angle-mismatch'] };
  return { level: 'usable', reasons: [] };
}

/**
 * The frame a top-anchored measurement is allowed to read, and why there is none.
 *
 * TWO FILTERS, IN THIS ORDER. The frame must be labelled `top` among those the check
 * admitted — and that label must be OBSERVED. A derived `top` is a proportion of the
 * swing envelope wearing the name of an event: S-23 read 22 such frames by eye and 13 of
 * them were not the top (docs/shaft/phase-audit/resultat.md), with the error changing
 * direction depending on which of the two derived sources produced it. Three spikes
 * (S-27, S-28, S-29) then failed to recover the top from the shaft signal, so there is at
 * present no reliable derived source to fall back on.
 *
 * REFUSING IS THE POINT. Anchoring on the last derived `top` does not make the number
 * approximately right, it makes it a number about an arbitrary frame — and it arrives
 * flagged `usable`, because `plausibility.ts` checks the points and not the moment. A
 * missing value is recoverable; a confident wrong one is not.
 *
 * The rejected frames travel back in `topIndices` so a caller can say WHICH frames it
 * declined to read, rather than only that it declined.
 */
interface TopFrame {
  /** The frame to read, or null when no frame may be read. */
  index: number | null;
  /** Why `index` is null. Null when it is not. */
  why: DerivedReason | null;
  /** Every admitted frame labelled `top`, observed or not — for traceability. */
  topIndices: number[];
}

function topFrame(checked: CheckedShaftSwingSeries): TopFrame {
  const tops = usableFrameIndices(checked, 'shaft').filter(
    (i) => checked.series.frames[i].phase === 'top',
  );
  if (tops.length === 0) return { index: null, why: 'phase-missing', topIndices: [] };
  const observed = tops.filter((i) => isPhaseObserved(checked.series.frames[i].phaseSource));
  if (observed.length === 0) {
    return { index: null, why: 'top-phase-not-observed', topIndices: tops };
  }
  // The LAST of them, for the reason `shaftPositionAtP4` gives: nearest the transition
  // the labelling allows. Among the observed ones only — an unobserved frame later in the
  // swing is not a better reading, it is an unverified one.
  return { index: observed[observed.length - 1], why: null, topIndices: tops };
}

/** The shaft LINE's tilt on this frame, or null when the endpoints are unusable. */
function shaftOrientation(frame: ShaftFrameSample): number | null {
  if (!frame.butt || !frame.hosel) return null;
  return lineOrientationDeg(frame.butt, frame.hosel);
}

interface BodyFrameBasis {
  origin: Point2D;
  /** Torso length in image pixels — the single isotropic scale. See `BodyFramePoint`. */
  scale: number;
}

/**
 * Mid-hip origin and torso-length scale from whichever landmarks are present.
 *
 * One shoulder and one hip are enough: a mid-point taken from a single side is offset
 * from the true centre by half a body width, which is a bias on `u` and not a change of
 * scale, and a flagged biased value beats no value on a view where one side is
 * occluded — which down-the-line very often is.
 */
function bodyFrame(body: BodyReference | null): BodyFrameBasis | null {
  if (!body) return null;
  const shoulder = midpoint(body.leftShoulder, body.rightShoulder);
  const hip = midpoint(body.leftHip, body.rightHip);
  if (!shoulder || !hip) return null;
  const scale = distance(shoulder, hip);
  if (!(scale > 0)) return null;
  return { origin: hip, scale };
}

function midpoint(a: Point2D | null, b: Point2D | null): Point2D | null {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return a ?? b ?? null;
}

function toBodyFrame(basis: BodyFrameBasis, p: Point2D): BodyFramePoint {
  return { u: (p.x - basis.origin.x) / basis.scale, v: (p.y - basis.origin.y) / basis.scale };
}

function reject<T>(
  id: MeasurementId,
  unit: MeasurementUnit,
  reasons: MeasurementReason[],
  frameIndices: number[],
): Measurement<T> {
  return {
    id,
    value: null,
    unit,
    quality: { level: 'rejected', reasons: dedupe(reasons) },
    assumes: MEASUREMENT_ASSUMPTIONS[id],
    frameIndices,
  };
}

const LEVEL_ORDER: Record<QualityLevel, number> = { usable: 0, uncertain: 1, rejected: 2 };

/** The worse of two levels — a measurement is never better than its weakest input. */
function worst(a: QualityLevel, b: QualityLevel): QualityLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

function dedupe(reasons: MeasurementReason[]): MeasurementReason[] {
  return [...new Set(reasons)];
}
