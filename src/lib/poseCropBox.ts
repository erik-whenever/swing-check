// POSE-DRIVEN CROP for the analysis frames (Ström E — Vision-kostnad).
//
// The images are ~95 % of the analysis cost and a large share of its latency:
// 17 frames at 720×1280 is ≈ 20 900 input tokens ≈ $0.063 per swing. Most of every
// one of those frames is background — sky, netting, the next bay. We already have
// pose landmarks for the whole swing, so we know where the golfer is and can send
// only that. It cuts cost and latency AND makes the golfer bigger in frame, which
// helps the rule judgement rather than hurting it.
//
// ONE BOX FOR THE WHOLE SWING, not one per frame. A box that tracks the golfer
// frame by frame breathes and drifts, and a sequence whose framing moves is HARDER
// to judge than an untouched one — the model cannot tell body movement from camera
// movement. So the box is the union of every landmark's bounding box across the
// envelope, computed once, applied to every frame identically. Stable framing is a
// requirement, not a nicety.
//
// The work is split in two on purpose:
//
//   computeLandmarkBounds()  landmarks → normalized union bounds.
//                            Runs at DETECTION time, where the samples are.
//   planCrop()               bounds + source size → source-pixel rect + output size.
//                            Runs at GRAB time, the first point where the video's
//                            real pixel dimensions are known.
//
// Only the four numbers of the bounds cross between them. That matters: a live
// session keeps every swing report for its whole run, and carrying the landmark
// arrays along would put the ring buffer's memory bound back on a growing list.
//
// Pure: no canvas, no video, no React. Unit-tested with synthetic landmarks.

import type { PoseSample } from './poseTrajectory';

// ── Tunables ─────────────────────────────────────────────────────────────────
/**
 * Horizontal margin, as a fraction of the raw landmark box width, on EACH side.
 * The spec floor is 0.15; we sit above it because the club sweeps well outside the
 * body and a clipped club head at the top of the backswing is a lost rule.
 *
 * In practice the aspect lock below adds far more than this: a golfer's landmark box
 * is much narrower than 9:16, so locking the aspect widens it by roughly half a body
 * width on each side regardless. This margin is the floor under that, and the thing
 * that still bites on a wide face-on box.
 */
const SIDE_MARGIN_FRAC = 0.2;
/**
 * Headroom above the topmost landmark, as a fraction of the box height. Same reason
 * as the sides: at the top of the backswing the club is above the head, and the
 * aspect lock expands the WIDTH (the shorter axis), so it never buys headroom.
 */
const TOP_MARGIN_FRAC = 0.12;
/**
 * Extension below the FEET, as a fraction of the box height — this is what puts the
 * ball position and the turf in frame instead of cutting at the shoes.
 */
const GROUND_MARGIN_FRAC = 0.08;
/**
 * Extension below the lowest landmark when no foot landmark was ever visible. The
 * ground is then somewhere below whatever we could see (knees, say), so the reach has
 * to be longer — a guess, but a guess in the safe direction.
 */
const NO_FOOT_GROUND_FRAC = 0.25;
/**
 * Sanity band on the resulting box, as a fraction of the source frame area. Below the
 * floor the landmarks are almost certainly wrong (a spurious detection in a corner);
 * above the ceiling the crop saves nothing worth the risk. Either way: no crop.
 *
 * OSÄKER: the floor also rejects a legitimately distant golfer who fills little of the
 * frame — exactly the case with the most to gain. If field logs show `too-small` firing
 * on good swings, this is the constant to revisit, not the margins.
 */
const MIN_AREA_FRAC = 0.25;
const MAX_AREA_FRAC = 0.9;
/** Longest side of the emitted frame, px. */
export const MAX_OUTPUT_SIDE = 900;
/**
 * Landmarks below this visibility are left out of the union. MediaPipe places
 * off-screen and occluded joints by extrapolation, and one confident-looking guess in
 * the wrong corner would widen the box for every frame of the swing. Feet are included
 * on the same terms — see `footMaxY`.
 */
const MIN_LANDMARK_VISIBILITY = 0.3;
/** Fewer contributing samples than this and the union is one lucky frame, not a swing. */
const MIN_BOUND_SAMPLES = 3;
/** MediaPipe foot landmarks: ankles, heels, toes. */
const FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32];

/**
 * Anthropic counts an image as roughly width × height / 750 tokens. Used only to put a
 * number on the saving in the log — never to make a decision.
 */
const PIXELS_PER_TOKEN = 750;
/** The frame size the saving is quoted against, i.e. what the path sent before. */
export const BASELINE_FRAME = { width: 720, height: 1280 } as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** Union of every usable landmark over the swing, in MediaPipe normalized coords. */
export interface LandmarkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Lowest (largest y) foot landmark seen, or null if the feet were never visible. */
  footMaxY: number | null;
  /** Samples that contributed at least one landmark. */
  samples: number;
}

/** Source-pixel rectangle to read out of each video frame. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropReason =
  | 'cropped'
  | 'no-bounds'
  | 'too-few-samples'
  | 'degenerate'
  | 'too-small'
  | 'too-large'
  | 'no-source-size';

export interface CropPlan {
  /** Rect to read from the source, or null to use the whole frame. */
  rect: CropRect | null;
  /** Canvas size to draw into — longest side ≤ `maxOutputSide`. */
  output: { width: number; height: number };
  /** Fraction of the source frame area the rect covers (1 when not cropping). */
  areaFrac: number;
  /** `cropped`, or why the crop was skipped. Always logged. */
  reason: CropReason;
  /** Estimated Vision tokens for one emitted frame. */
  outputTokens: number;
  /** Estimated tokens for one 720×1280 frame — the comparison the saving is quoted against. */
  baselineTokens: number;
  /** Percent fewer tokens per frame than the baseline. Negative would mean a regression. */
  savedPct: number;
}

// ── Bounds ───────────────────────────────────────────────────────────────────

/**
 * Union bounding box of every usable landmark in `[startSec, finishSec]`.
 *
 * The window is the swing ENVELOPE, not the padded segment: the frames that get sent
 * come from inside the envelope, so anything the golfer did before the take-away or
 * after the finish would only inflate the box for no coverage gained.
 *
 * Returns null when there is nothing trustworthy to build a box from — the caller then
 * sends the whole frame, which is always correct, just expensive.
 */
export function computeLandmarkBounds(
  samples: PoseSample[],
  startSec: number,
  finishSec: number,
): LandmarkBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let footMaxY: number | null = null;
  let contributing = 0;

  for (const sample of samples) {
    if (sample.t < startSec || sample.t > finishSec) continue;
    let used = false;
    for (const lm of sample.landmarks) {
      if (!lm) continue;
      if ((lm.visibility ?? 1) < MIN_LANDMARK_VISIBILITY) continue;
      if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) continue;
      // Clamp per landmark: MediaPipe happily extrapolates outside the frame, and a
      // point at x = 1.4 is not a reason to widen a box that will be clamped anyway.
      const x = clamp(lm.x, 0, 1);
      const y = clamp(lm.y, 0, 1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      used = true;
    }
    for (const idx of FOOT_LANDMARKS) {
      const lm = sample.landmarks[idx];
      if (!lm || (lm.visibility ?? 1) < MIN_LANDMARK_VISIBILITY) continue;
      if (!Number.isFinite(lm.y)) continue;
      const y = clamp(lm.y, 0, 1);
      if (footMaxY === null || y > footMaxY) footMaxY = y;
    }
    if (used) contributing++;
  }

  if (contributing === 0 || minX === Infinity) return null;
  return { minX, minY, maxX, maxY, footMaxY, samples: contributing };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

/**
 * Turn normalized bounds into a source-pixel rect and an output size, or decide not to
 * crop at all. Never throws: every failure path returns a whole-frame plan carrying the
 * reason, so the caller's only job is to log it.
 */
export function planCrop(
  bounds: LandmarkBounds | null,
  sourceWidth: number,
  sourceHeight: number,
  maxOutputSide: number = MAX_OUTPUT_SIDE,
): CropPlan {
  const whole = (reason: CropReason): CropPlan =>
    finish(null, fit(sourceWidth, sourceHeight, maxOutputSide), 1, reason);

  if (!isPositive(sourceWidth) || !isPositive(sourceHeight)) {
    return finish(null, { width: 1, height: 1 }, 1, 'no-source-size');
  }
  if (!bounds) return whole('no-bounds');
  if (bounds.samples < MIN_BOUND_SAMPLES) return whole('too-few-samples');

  let left = bounds.minX * sourceWidth;
  let right = bounds.maxX * sourceWidth;
  let top = bounds.minY * sourceHeight;
  let bottom = bounds.maxY * sourceHeight;
  const rawW = right - left;
  const rawH = bottom - top;
  if (!(rawW > 0) || !(rawH > 0)) return whole('degenerate');

  // ── Margins ───────────────────────────────────────────────────────────────
  left -= SIDE_MARGIN_FRAC * rawW;
  right += SIDE_MARGIN_FRAC * rawW;
  top -= TOP_MARGIN_FRAC * rawH;
  // Down to the ground: past the feet when we can see them, further when we cannot.
  const groundY =
    bounds.footMaxY === null
      ? bottom + NO_FOOT_GROUND_FRAC * rawH
      : bounds.footMaxY * sourceHeight + GROUND_MARGIN_FRAC * rawH;
  bottom = Math.max(bottom, groundY);

  // ── Aspect lock to the source (9:16 on the phone) ─────────────────────────
  // Expand the SHORTER axis only, so nothing is scaled unevenly downstream. For a
  // golfer this is nearly always the width.
  let w = right - left;
  let h = bottom - top;
  let cx = (left + right) / 2;
  let cy = (top + bottom) / 2;
  const targetAspect = sourceWidth / sourceHeight;
  if (w / h < targetAspect) {
    w = h * targetAspect;
  } else {
    h = w / targetAspect;
  }

  // ── Clamp into the frame ──────────────────────────────────────────────────
  // Shrink first (same aspect on both sides, so one scale factor keeps the ratio
  // exact), then slide the centre back inside. Sliding beats shrinking: it keeps the
  // golfer whole when the box merely hangs over an edge.
  const scale = Math.min(1, sourceWidth / w, sourceHeight / h);
  w *= scale;
  h *= scale;
  cx = clamp(cx, w / 2, sourceWidth - w / 2);
  cy = clamp(cy, h / 2, sourceHeight - h / 2);

  const areaFrac = (w * h) / (sourceWidth * sourceHeight);
  if (areaFrac < MIN_AREA_FRAC) return whole('too-small');
  if (areaFrac > MAX_AREA_FRAC) return whole('too-large');

  // Integer rect, re-clamped after rounding so drawImage never reads outside the frame.
  const width = Math.max(1, Math.min(Math.round(w), sourceWidth));
  const height = Math.max(1, Math.min(Math.round(h), sourceHeight));
  const x = Math.max(0, Math.min(Math.round(cx - w / 2), sourceWidth - width));
  const y = Math.max(0, Math.min(Math.round(cy - h / 2), sourceHeight - height));

  return finish(
    { x, y, width, height },
    fit(width, height, maxOutputSide),
    (width * height) / (sourceWidth * sourceHeight),
    'cropped',
  );
}

/** Rough Vision input-token count for one image. Diagnostic only. */
export function estimateImageTokens(width: number, height: number): number {
  return Math.round((width * height) / PIXELS_PER_TOKEN);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function finish(
  rect: CropRect | null,
  output: { width: number; height: number },
  areaFrac: number,
  reason: CropReason,
): CropPlan {
  const outputTokens = estimateImageTokens(output.width, output.height);
  const baselineTokens = estimateImageTokens(BASELINE_FRAME.width, BASELINE_FRAME.height);
  return {
    rect,
    output,
    areaFrac,
    reason,
    outputTokens,
    baselineTokens,
    savedPct: Math.round((1 - outputTokens / baselineTokens) * 1000) / 10,
  };
}

/** Scale (never up) so the longest side is at most `maxSide`. */
function fit(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const s = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * s)),
    height: Math.max(1, Math.round(height * s)),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  // `hi < lo` happens when a box is wider than the frame; the centre is then the frame
  // centre, which is the only sane answer.
  if (hi < lo) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, n));
}

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}
