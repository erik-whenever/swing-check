// PLAUSIBILITY CHECK — the gate between the raw data layer and anything that derives a
// measurement from it.
//
// A measurement may not reach a rule without having passed through here. That is
// enforced in the type system, not by convention: `derived.ts` takes a
// `CheckedShaftSwingSeries`, and `checkShaftSeries` is the only thing that produces
// one. A caller who wants to skip the check has to say so in a cast, in writing.
//
// NOTHING IS DISCARDED SILENTLY. Every frame comes back with a flag for its shaft angle
// and a flag for its blade angle — `usable`, `uncertain` or `rejected` — and every flag
// that is not `usable` carries at least one reason. A rejected frame stays in the
// series with its coordinates intact; only its flag changes. `SeriesQuality.counts`
// then says how many frames fell to each reason, so a swing that lost 18 of 20 frames
// says why rather than just coming out empty.
//
// ── THE THREE MEASURED FAILURE PATTERNS ─────────────────────────────────────────────
//
// 1. SWAPPED ENDS. `toe` and `heel` change places between neighbouring frames and the
//    blade angle jumps 150–180°. The keypoints are ordered, so this is a real reversal
//    of a directed vector, not a wrap artefact — which is why `angleDifference` is
//    never folded at 90° (see `angles.ts`). Caught per frame by `FLIP_MIN_DEG`.
//
// 2. THE BLADE ANGLE IS RESTLESS THROUGHOUT. On dense time steps the blade angle moves
//    at a median 71–78 °/s against the shaft's 12 °/s — a ratio of about 6. Both
//    vectors sit on the same rigid body and must rotate at comparable rates, so a
//    ratio like that is not the club rotating, it is the model guessing. This is a
//    property of the whole series rather than of any one frame, so it is checked at
//    series level by `UNREST_RATIO_MAX` and then written down on every frame it
//    condemns.
//
// 3. THE SOLE POINTS ARE NOT CONFIDENT. `toe`/`heel` confidence tops out at 0.55 and
//    sits at a median of 0.26, against 0.99–1.00 for `butt`/`hosel`. Hence SEPARATE
//    THRESHOLDS: one shared bar at 0.5 admits every shaft point and no sole point at
//    all — zero blade coverage — while one shared bar at 0.1 admits every shaft point
//    including the bad ones. A shared threshold does not make the measurement stricter,
//    it makes it empty (or makes it rubbish). Measured on a full clip at 30 fps: 0.5 on
//    the sole points gave 0 % coverage, 0.1 gave 80 %.
//
// The three together are why `derived.ts` exposes no blade-derived measurement. This
// module still measures the blade in full — a check that cannot fail is not a check,
// and the day a four-point checkpoint lands, the ratio and the coverage are what say
// whether it is better.

import { angleDifference, distance, median } from './angles';
import type { ShaftFrameSample, ShaftSwingSeries } from './shaftSeries';

// ── Thresholds ───────────────────────────────────────────────────────────────
// Every number here is a measurement or a stated judgement, never a round number
// picked because it looked reasonable.

/**
 * Shaft keypoint confidence at or above which `butt`/`hosel` is taken at face value.
 * The detector's own `KEYPOINT_THRESHOLD`; `butt`/`hosel` come back at 0.99–1.00, so
 * this bar costs essentially nothing and exists to catch the collapse, not to trim.
 */
export const SHAFT_CONF_USABLE = 0.5;
/** Below this a shaft point is not a measurement. Half the bar above. */
export const SHAFT_CONF_FLOOR = 0.25;

/**
 * Blade keypoint confidence at or above which `toe`/`heel` would be taken at face
 * value — deliberately the same number as `SHAFT_CONF_USABLE`, and deliberately a bar
 * that the shipped model's sole points essentially never clear (observed maximum:
 * 0.55, median 0.26). That is the finding, stated as a constant: the two point classes
 * live on different scales.
 */
export const BLADE_CONF_USABLE = 0.5;
/**
 * Below this a sole point is not a measurement. 0.1 is where coverage on a full clip
 * goes from 0 % to 80 % — so this is the bar that makes a blade angle exist at all,
 * and everything between it and `BLADE_CONF_USABLE` is `uncertain`, which under the
 * shipped checkpoint is nearly all of it.
 */
export const BLADE_CONF_FLOOR = 0.1;

/**
 * A jump larger than this between neighbouring frames is an endpoint swap, not
 * rotation. The observed swaps land at 150–180°; the bar sits at 90° so that a swap
 * seen from an oblique angle, where the projected reversal is short of a half turn,
 * is still caught. Same value as `FLIP_DEG` in `training/measure_blade_stability.py`.
 */
export const FLIP_MIN_DEG = 90;
/** The band the measured swaps actually occupy. Documentation, never a threshold. */
export const OBSERVED_FLIP_BAND_DEG: readonly [number, number] = [150, 180];

/**
 * Blade rate ÷ shaft rate, medians, above which the blade series is condemned as a
 * whole. Two vectors on one rigid body; the observed ratio is about 6 (71–78 °/s
 * against 12 °/s). The bar is 3 — halfway in orders of magnitude between "the same
 * body" (1) and what was measured, so a checkpoint has to be genuinely better rather
 * than merely less bad to clear it.
 */
export const UNREST_RATIO_MAX = 3;
/** What the shipped two-point pipeline's successor measured. Documentation. */
export const OBSERVED_UNREST_RATIO = 6;

/**
 * Minimum endpoint separation, as a fraction of the image diagonal. Below it the two
 * points are effectively one and the angle between them is noise amplified by a
 * division. 1 % of the diagonal is ~22 px on a 1080×1920 frame; a shaft in frame is an
 * order of magnitude longer, and a sole a good deal shorter but still well clear.
 */
export const MIN_SEPARATION_FRAC = 0.01;

/**
 * Longest gap between two frames that may still be compared as neighbours, seconds.
 * The training batches sample about one frame per swing each, so reading the batches
 * together gives a median step of ~0.3 s with a tail past 1 s. A club travels a long
 * way in a second, and a "jump" across that gap says nothing about a swap. Same
 * default as `--max-gap-sec` in `training/measure_blade_stability.py`.
 */
export const MAX_GAP_SEC = 1.0;

/**
 * Fraction of the series' frames — all of them, not just the survivors — that must be
 * `usable` before the series as a whole is called `usable`. A swing carried by two good
 * frames out of twenty is a swing whose derived numbers should arrive marked, not a
 * swing with clean numbers.
 */
export const SERIES_USABLE_FRAC = 0.5;

// ── Quality ──────────────────────────────────────────────────────────────────

/**
 * `usable` — take the number.
 * `uncertain` — the number exists and may be used, but a rule that acts on it should
 *               know it is soft. Never silently promoted to `usable`.
 * `rejected` — do not use the number. The data stays; the flag is what changed.
 */
export type QualityLevel = 'usable' | 'uncertain' | 'rejected';

/** Why a flag is not `usable`. One flag can carry several. */
export type QualityReason =
  /** The model did not locate one or both shaft endpoints on this frame. */
  | 'shaft-point-missing'
  /** Shaft endpoint confidence between the floor and the usable bar. */
  | 'shaft-confidence-low'
  /** Shaft endpoint confidence below the floor. */
  | 'shaft-confidence-below-floor'
  /** `butt` and `hosel` are effectively the same point; the angle is noise. */
  | 'degenerate-shaft'
  /** The model did not locate one or both sole points on this frame. */
  | 'blade-point-missing'
  /** Sole point confidence between the floor and the usable bar. */
  | 'blade-confidence-low'
  /** Sole point confidence below the floor. */
  | 'blade-confidence-below-floor'
  /** `toe` and `heel` are effectively the same point; the angle is noise. */
  | 'degenerate-blade'
  /** This frame disagrees with BOTH its neighbours by more than `FLIP_MIN_DEG`. */
  | 'endpoint-flip'
  /**
   * This frame is one end of a jump larger than `FLIP_MIN_DEG`, and which of the two
   * frames flipped cannot be told apart — a sustained swap, or a swap at the edge of
   * the series. Marked on both ends rather than guessed at.
   */
  | 'endpoint-flip-ambiguous'
  /** Series level: the blade rotates implausibly fast against the shaft. */
  | 'blade-unrest'
  /** The loaded checkpoint carries no sole points at all. Not a frame's fault. */
  | 'model-lacks-blade-keypoints'
  /** Both endpoints were located but the producer left the angle null. */
  | 'angle-missing'
  /** Series level: not one frame survived. */
  | 'no-usable-frames'
  /** Series level: fewer than `SERIES_USABLE_FRAC` of the survivors are `usable`. */
  | 'sparse-usable-frames'
  /** Series level: `frames` is not ascending in `tSec`; neighbour tests are unsafe. */
  | 'frames-out-of-order';

/** A level plus every reason behind it. `usable` carries an empty `reasons`. */
export interface QualityFlag {
  level: QualityLevel;
  reasons: QualityReason[];
}

/** Both of a frame's measurements, flagged independently. */
export interface FrameQuality {
  /** Index into `ShaftSwingSeries.frames`. */
  frameIndex: number;
  tSec: number;
  /** Flag for this frame's `shaftAngleDeg` and its two endpoints. */
  shaftAngle: QualityFlag;
  /** Flag for this frame's `bladeAngleDeg` and its two sole points. */
  bladeAngle: QualityFlag;
}

/** What the check concluded about a swing. */
export interface SeriesQuality {
  /** One entry per frame, in the same order as `ShaftSwingSeries.frames`. */
  frames: FrameQuality[];
  /** The series' shaft angle as a whole. */
  shaftAngle: QualityFlag;
  /** The series' blade angle as a whole. */
  bladeAngle: QualityFlag;
  /** Median |Δangle/Δt| over admissible neighbouring pairs, °/s. Null if no pairs. */
  shaftRateMedianDegPerSec: number | null;
  /** Same for the blade. Measured at 71–78 °/s on the shipped pipeline. */
  bladeRateMedianDegPerSec: number | null;
  /** Blade median ÷ shaft median. Null when either is missing or the shaft median is 0. */
  unrestRatio: number | null;
  /** How many frames were flagged `endpoint-flip`, per angle. */
  flipCount: { shaft: number; blade: number };
  /** Frames at each level, per angle — the coverage the thresholds actually bought. */
  levelCount: {
    shaft: Record<QualityLevel, number>;
    blade: Record<QualityLevel, number>;
  };
  /** How many frame-level flags carried each reason. Nothing is dropped unexplained. */
  counts: Partial<Record<QualityReason, number>>;
  /** The thresholds this check ran with, so a result can be re-argued from itself. */
  thresholds: PlausibilityThresholds;
}

/** Every tunable the check reads. Defaults are the module constants above. */
export interface PlausibilityThresholds {
  shaftConfUsable: number;
  shaftConfFloor: number;
  bladeConfUsable: number;
  bladeConfFloor: number;
  flipMinDeg: number;
  unrestRatioMax: number;
  minSeparationFrac: number;
  maxGapSec: number;
  seriesUsableFrac: number;
}

export const DEFAULT_THRESHOLDS: PlausibilityThresholds = {
  shaftConfUsable: SHAFT_CONF_USABLE,
  shaftConfFloor: SHAFT_CONF_FLOOR,
  bladeConfUsable: BLADE_CONF_USABLE,
  bladeConfFloor: BLADE_CONF_FLOOR,
  flipMinDeg: FLIP_MIN_DEG,
  unrestRatioMax: UNREST_RATIO_MAX,
  minSeparationFrac: MIN_SEPARATION_FRAC,
  maxGapSec: MAX_GAP_SEC,
  seriesUsableFrac: SERIES_USABLE_FRAC,
};

// ── The checked series ───────────────────────────────────────────────────────

declare const checkedBrand: unique symbol;

/**
 * A series that has been through `checkShaftSeries`, carrying its verdict.
 *
 * The brand is unforgeable outside this module, so "measurements may not be fed to
 * rules without having passed a check" is a compile error rather than a code-review
 * note. `series` is the original record, untouched — the check flags, it never edits.
 */
export interface CheckedShaftSwingSeries {
  readonly [checkedBrand]: true;
  readonly series: ShaftSwingSeries;
  readonly quality: SeriesQuality;
}

// ── The check ────────────────────────────────────────────────────────────────

/** Which of the two angles a frame-level test is about. */
type AngleKind = 'shaft' | 'blade';

/**
 * Flag every measurement in `series` and return it sealed.
 *
 * Pure and total: no throw, no mutation of the input, no clock, no environment. The
 * same series in gives the same verdict out on any platform, which is the point of
 * keeping the raw layer free of the browser.
 */
export function checkShaftSeries(
  series: ShaftSwingSeries,
  overrides: Partial<PlausibilityThresholds> = {},
): CheckedShaftSwingSeries {
  const t: PlausibilityThresholds = { ...DEFAULT_THRESHOLDS, ...overrides };
  const frames = series.frames;

  const diagonal = Math.hypot(series.imageSize.width, series.imageSize.height);
  const minSeparationPx = diagonal * t.minSeparationFrac;
  const modelHasBlade = series.model.keypoints >= 4;

  const quality: FrameQuality[] = frames.map((f, i) => ({
    frameIndex: i,
    tSec: f.tSec,
    shaftAngle: checkShaftPoints(f, minSeparationPx, t),
    bladeAngle: modelHasBlade
      ? checkBladePoints(f, minSeparationPx, t)
      : flag('rejected', ['model-lacks-blade-keypoints']),
  }));

  const outOfOrder = frames.some((f, i) => i > 0 && f.tSec <= frames[i - 1].tSec);

  // Flip detection and rates run only over frames whose points already survived, and
  // only over pairs close enough in time to be neighbours at all.
  const shaftPairs = neighbourPairs(frames, quality, 'shaft', t.maxGapSec);
  const bladePairs = neighbourPairs(frames, quality, 'blade', t.maxGapSec);

  const shaftFlips = markFlips(shaftPairs, quality, 'shaft', t.flipMinDeg);
  const bladeFlips = markFlips(bladePairs, quality, 'blade', t.flipMinDeg);

  const shaftRate = median(shaftPairs.map((p) => p.rateDegPerSec));
  const bladeRate = median(bladePairs.map((p) => p.rateDegPerSec));
  const unrestRatio = shaftRate !== null && bladeRate !== null && shaftRate > 0
    ? bladeRate / shaftRate
    : null;

  // The blade's restlessness is a property of the whole series, so it is applied to
  // every blade flag that is still standing — written down, not silently withheld.
  if (unrestRatio !== null && unrestRatio > t.unrestRatioMax) {
    for (const q of quality) {
      if (q.bladeAngle.level !== 'rejected') {
        q.bladeAngle.level = 'rejected';
        q.bladeAngle.reasons.push('blade-unrest');
      }
    }
  }

  const shaftSeriesFlag = summarise(quality, 'shaft', t.seriesUsableFrac);
  const bladeSeriesFlag = summarise(quality, 'blade', t.seriesUsableFrac);
  if (unrestRatio !== null && unrestRatio > t.unrestRatioMax) {
    addReason(bladeSeriesFlag, 'blade-unrest');
    bladeSeriesFlag.level = 'rejected';
  }
  if (outOfOrder) {
    // Neighbour tests assume an ordered series; say so on both angles rather than
    // quietly reporting flip counts computed against the wrong neighbour.
    for (const f of [shaftSeriesFlag, bladeSeriesFlag]) {
      addReason(f, 'frames-out-of-order');
      if (f.level === 'usable') f.level = 'uncertain';
    }
  }

  return {
    series,
    quality: {
      frames: quality,
      shaftAngle: shaftSeriesFlag,
      bladeAngle: bladeSeriesFlag,
      shaftRateMedianDegPerSec: shaftRate,
      bladeRateMedianDegPerSec: bladeRate,
      unrestRatio,
      flipCount: { shaft: shaftFlips, blade: bladeFlips },
      levelCount: {
        shaft: countLevels(quality, 'shaft'),
        blade: countLevels(quality, 'blade'),
      },
      counts: countReasons(quality),
      thresholds: t,
    },
  } as CheckedShaftSwingSeries;
}

/**
 * Indices of the frames whose `shaftAngle` (or `bladeAngle`) may be used, at or above
 * `minLevel`. The one sanctioned way for a consumer to ask "which frames count".
 */
export function usableFrameIndices(
  checked: CheckedShaftSwingSeries,
  kind: AngleKind = 'shaft',
  minLevel: Exclude<QualityLevel, 'rejected'> = 'uncertain',
): number[] {
  const admits = minLevel === 'usable' ? ['usable'] : ['usable', 'uncertain'];
  return checked.quality.frames
    .filter((q) => admits.includes(kind === 'shaft' ? q.shaftAngle.level : q.bladeAngle.level))
    .map((q) => q.frameIndex);
}

// ── Frame-level tests ────────────────────────────────────────────────────────

function checkShaftPoints(
  f: ShaftFrameSample,
  minSeparationPx: number,
  t: PlausibilityThresholds,
): QualityFlag {
  if (!f.butt || !f.hosel) return flag('rejected', ['shaft-point-missing']);
  const conf = Math.min(f.butt.conf, f.hosel.conf);
  if (conf < t.shaftConfFloor) return flag('rejected', ['shaft-confidence-below-floor']);
  if (distance(f.butt, f.hosel) < minSeparationPx) {
    return flag('rejected', ['degenerate-shaft']);
  }
  if (f.shaftAngleDeg === null) return flag('rejected', ['angle-missing']);
  if (conf < t.shaftConfUsable) return flag('uncertain', ['shaft-confidence-low']);
  return flag('usable', []);
}

function checkBladePoints(
  f: ShaftFrameSample,
  minSeparationPx: number,
  t: PlausibilityThresholds,
): QualityFlag {
  if (!f.toe || !f.heel) return flag('rejected', ['blade-point-missing']);
  const conf = Math.min(f.toe.conf, f.heel.conf);
  if (conf < t.bladeConfFloor) return flag('rejected', ['blade-confidence-below-floor']);
  if (distance(f.toe, f.heel) < minSeparationPx) {
    return flag('rejected', ['degenerate-blade']);
  }
  if (f.bladeAngleDeg === null) return flag('rejected', ['angle-missing']);
  if (conf < t.bladeConfUsable) return flag('uncertain', ['blade-confidence-low']);
  return flag('usable', []);
}

// ── Neighbour tests ──────────────────────────────────────────────────────────

interface NeighbourPair {
  /** Indices into `quality` / `frames` — consecutive among the surviving frames. */
  a: number;
  b: number;
  deltaDeg: number;
  rateDegPerSec: number;
}

/**
 * Consecutive pairs among the frames that survived the point-level tests, skipping any
 * pair further apart in time than `maxGapSec`.
 *
 * Adjacency is over the SURVIVORS, not over the raw array: a dropped frame in the
 * middle should not sever the series, it should just widen the step — and the gap
 * guard is what decides whether the widened step is still a comparison.
 */
function neighbourPairs(
  frames: readonly ShaftFrameSample[],
  quality: readonly FrameQuality[],
  kind: AngleKind,
  maxGapSec: number,
): NeighbourPair[] {
  const live: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const level = kind === 'shaft' ? quality[i].shaftAngle.level : quality[i].bladeAngle.level;
    if (level !== 'rejected') live.push(i);
  }

  const pairs: NeighbourPair[] = [];
  for (let k = 0; k + 1 < live.length; k++) {
    const a = live[k];
    const b = live[k + 1];
    const dt = frames[b].tSec - frames[a].tSec;
    if (!(dt > 0) || dt > maxGapSec) continue;
    const angleA = kind === 'shaft' ? frames[a].shaftAngleDeg : frames[a].bladeAngleDeg;
    const angleB = kind === 'shaft' ? frames[b].shaftAngleDeg : frames[b].bladeAngleDeg;
    if (angleA === null || angleB === null) continue;
    const deltaDeg = angleDifference(angleA, angleB);
    pairs.push({ a, b, deltaDeg, rateDegPerSec: deltaDeg / dt });
  }
  return pairs;
}

/**
 * Flag endpoint swaps, and return how many frames were caught outright.
 *
 * TWO PASSES, BECAUSE ONE CANNOT TELL THE TWO CASES APART.
 *
 * A frame that disagrees with BOTH its neighbours is the flipped one — the rest of the
 * series agrees with itself and this frame does not. That is `endpoint-flip`, rejected,
 * and it is the pattern the data actually shows: `toe` and `heel` trading places for a
 * frame and trading back.
 *
 * A single jump whose other end is not itself an isolated flip is a swap that LASTS, or
 * a swap at the edge of the series. There is no way to tell from the angles alone which
 * side of that jump is the club and which is the model, so both ends are marked
 * `endpoint-flip-ambiguous` and downgraded rather than one of them being guessed at.
 *
 * // OSÄKER: a swap sustained across several frames is caught only at its two
 * // boundaries, never in its interior — the interior agrees with itself. Risk: a
 * // measurement taken from the middle of a long swap reads as merely `uncertain`. It
 * // is bounded by the series-level unrest ratio, which is driven up by exactly the
 * // boundary jumps a sustained swap produces, and by the fact that nothing blade-
 * // derived is exposed upward at all. Revisit if a four-point checkpoint makes
 * // per-frame blade angles load-bearing.
 */
function markFlips(
  pairs: readonly NeighbourPair[],
  quality: FrameQuality[],
  kind: AngleKind,
  flipMinDeg: number,
): number {
  const jumps = pairs.filter((p) => p.deltaDeg > flipMinDeg);
  if (jumps.length === 0) return 0;

  // Pass 1 — a frame with a jump on both sides is the one that flipped.
  const jumpsByFrame = new Map<number, number>();
  for (const j of jumps) {
    jumpsByFrame.set(j.a, (jumpsByFrame.get(j.a) ?? 0) + 1);
    jumpsByFrame.set(j.b, (jumpsByFrame.get(j.b) ?? 0) + 1);
  }
  const isolated = new Set<number>();
  for (const [index, count] of jumpsByFrame) {
    if (count >= 2) isolated.add(index);
  }
  for (const index of isolated) {
    const f = kind === 'shaft' ? quality[index].shaftAngle : quality[index].bladeAngle;
    f.level = 'rejected';
    addReason(f, 'endpoint-flip');
  }

  // Pass 2 — jumps that pass 1 did not explain leave both ends ambiguous.
  for (const j of jumps) {
    if (isolated.has(j.a) || isolated.has(j.b)) continue;
    for (const index of [j.a, j.b]) {
      const f = kind === 'shaft' ? quality[index].shaftAngle : quality[index].bladeAngle;
      if (f.level === 'usable') f.level = 'uncertain';
      addReason(f, 'endpoint-flip-ambiguous');
    }
  }

  return isolated.size;
}

// ── Summaries ────────────────────────────────────────────────────────────────

function summarise(
  quality: readonly FrameQuality[],
  kind: AngleKind,
  usableFrac: number,
): QualityFlag {
  const levels = quality.map((q) => (kind === 'shaft' ? q.shaftAngle.level : q.bladeAngle.level));
  const surviving = levels.filter((l) => l !== 'rejected').length;
  if (surviving === 0) return flag('rejected', ['no-usable-frames']);
  const usable = levels.filter((l) => l === 'usable').length;
  if (usable / levels.length < usableFrac) return flag('uncertain', ['sparse-usable-frames']);
  return flag('usable', []);
}

function countLevels(
  quality: readonly FrameQuality[],
  kind: AngleKind,
): Record<QualityLevel, number> {
  const out: Record<QualityLevel, number> = { usable: 0, uncertain: 0, rejected: 0 };
  for (const q of quality) {
    out[kind === 'shaft' ? q.shaftAngle.level : q.bladeAngle.level]++;
  }
  return out;
}

function countReasons(quality: readonly FrameQuality[]): Partial<Record<QualityReason, number>> {
  const out: Partial<Record<QualityReason, number>> = {};
  for (const q of quality) {
    for (const r of [...q.shaftAngle.reasons, ...q.bladeAngle.reasons]) {
      out[r] = (out[r] ?? 0) + 1;
    }
  }
  return out;
}

function flag(level: QualityLevel, reasons: QualityReason[]): QualityFlag {
  return { level, reasons };
}

/** Append a reason once — a flag lists each reason at most once, in first-seen order. */
function addReason(f: QualityFlag, reason: QualityReason): void {
  if (!f.reasons.includes(reason)) f.reasons.push(reason);
}
