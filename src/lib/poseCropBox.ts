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
// Only the bounds cross between them — four numbers and a small per-part quality
// summary. That matters: a live session keeps every swing report for its whole run, and
// carrying the landmark arrays along would put the ring buffer's memory bound back on a
// growing list.
//
// THE QUALITY GATE IS ABOUT THE SKELETON, NOT THE BOX. A crop is only as good as the
// landmarks behind it, so what gets tested is whether both shoulders, both hips and at
// least one foot tracked confidently through the swing. Box AREA is explicitly not a
// quality signal: a small box is the expected and wanted outcome at tripod distance —
// the case cropping exists for — and an earlier 25 % area floor rejected exactly those
// swings. Area now only carries a 4 % net under boxes that cannot be a person at all,
// plus the unchanged 90 % ceiling where there is nothing left to gain.
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
 * AREA IS NOT A QUALITY SIGNAL, and this floor is not the quality gate.
 *
 * A small box is the EXPECTED and WANTED outcome when the golfer stands at tripod
 * distance — precisely the case cropping exists for. An earlier 25 % floor rejected
 * exactly those swings. The quality question ("are these landmarks a real skeleton?")
 * is answered by the landmark gate below; this is only a last net under a box so tiny
 * it cannot be a person at all. 4 % of the frame is a golfer about 20 % of the frame
 * height — already further away than the camera can usefully resolve.
 */
const MIN_AREA_FRAC = 0.04;
/** Above this the crop saves nothing worth the risk of clipping something. */
const MAX_AREA_FRAC = 0.9;
/**
 * THE QUALITY GATE. A crop is only as trustworthy as the skeleton it was derived from,
 * so we test the skeleton, not the box: both shoulders, both hips, and at least one
 * foot have to be there and be tracked with confidence across the swing. Those five
 * carry the torso and the ground contact — the parts the box is anchored on. A stray
 * high-confidence hand in a corner cannot pass this on its own, which is the failure
 * mode the old area floor was reaching for.
 */
const REQUIRED_PARTS = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'feet'] as const;
/**
 * PRESENCE FLOOR on MediaPipe's `visibility`. Below this the point is a guess rather
 * than an observation, and it is excluded from the union as well as from the presence
 * count. 0.3 is deliberately permissive: `visibility` is an OCCLUSION score, so a hip
 * behind a trailing arm at the top of the backswing dips without the estimate being
 * wrong, and this must not throw the swing away for that.
 */
const PRESENCE_FLOOR = 0.3;
/**
 * A required part must clear PRESENCE_FLOOR in at least this fraction of the swing's
 * samples. Half is the point where "briefly occluded" turns into "not really tracked":
 * a golfer's hip or foot can be hidden through the backswing, but not through the
 * backswing AND the downswing AND the finish.
 */
const REQUIRED_PRESENT_FRAC = 0.5;
/**
 * Mean `visibility` a required part must average over the swing. Present but never
 * confident is a different failure from absent, and it gets its own reason.
 *
 * 0.6 is a judgement, not a measurement: a clearly seen joint sits around 0.9+, an
 * inferred-but-plausible one in the 0.5–0.8 band, and a guess below 0.5, so this asks
 * for "better than a coin flip across the whole swing" while still tolerating the
 * occlusion dips above. Tune it against `gateDetail` in the field logs, which reports
 * the weakest part and its actual numbers on every swing.
 */
const REQUIRED_VISIBILITY = 0.6;
/** Longest side of the emitted frame, px. */
export const MAX_OUTPUT_SIDE = 900;
/** Fewer contributing samples than this and the union is one lucky frame, not a swing. */
const MIN_BOUND_SAMPLES = 3;
/** MediaPipe foot landmarks: ankles, heels, toes. */
const FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32];
/**
 * Which MediaPipe indices back each required part. `feet` is an OR-group — one foot is
 * enough, and the best-tracked foot landmark in a sample speaks for the group.
 */
const PART_LANDMARKS: Record<SkeletonPart, number[]> = {
  leftShoulder: [11],
  rightShoulder: [12],
  leftHip: [23],
  rightHip: [24],
  feet: FOOT_LANDMARKS,
};

/**
 * Anthropic counts an image as roughly width × height / 750 tokens. Used only to put a
 * number on the saving in the log — never to make a decision.
 */
const PIXELS_PER_TOKEN = 750;
/** The frame size the saving is quoted against, i.e. what the path sent before. */
export const BASELINE_FRAME = { width: 720, height: 1280 } as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** The five body parts the crop is only trusted with when all of them track. */
export type SkeletonPart = (typeof REQUIRED_PARTS)[number];

/** How well one required part tracked across the swing. */
export interface PartQuality {
  /** Fraction of contributing samples where the part cleared `PRESENCE_FLOOR`. */
  presentFrac: number;
  /** Mean `visibility` over contributing samples (0 for samples where it was absent). */
  meanVisibility: number;
}

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
  /**
   * Per-part tracking quality over the same samples — the input to the quality gate.
   * Carried on the bounds because this is the only place the landmarks themselves are
   * in scope; `planCrop` runs much later, with four numbers and this summary.
   */
  skeleton: Record<SkeletonPart, PartQuality>;
}

/** Source-pixel rectangle to read out of each video frame. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Why the crop happened or did not. This is the signal a field test is read against,
 * so the causes are kept apart rather than collapsed into "skipped":
 *
 *  ok                        cropped.
 *  landmarks-incomplete      a required part was absent for too much of the swing.
 *  landmarks-low-confidence  the parts were there, but never confidently tracked.
 *  box-degenerate            the box cannot be a person (zero-sized, or under the 4 % net).
 *  box-too-large             the golfer already fills the frame; nothing to gain.
 *  no-bounds                 not one usable landmark in the envelope.
 *  too-few-samples           fewer contributing samples than a swing can have.
 *  no-source-size            video metadata not loaded — dimensions unknown.
 */
export type CropReason =
  | 'ok'
  | 'landmarks-incomplete'
  | 'landmarks-low-confidence'
  | 'box-degenerate'
  | 'box-too-large'
  | 'no-bounds'
  | 'too-few-samples'
  | 'no-source-size';

export interface CropPlan {
  /** Rect to read from the source, or null to use the whole frame. */
  rect: CropRect | null;
  /** Canvas size to draw into — longest side ≤ `maxOutputSide`. */
  output: { width: number; height: number };
  /** Fraction of the source frame area the rect covers (1 when not cropping). */
  areaFrac: number;
  /** `ok`, or why the crop was skipped. Always logged. */
  reason: CropReason;
  /**
   * The weakest required part and its numbers, e.g. `feet present 0.20 vis 0.31`. Set
   * whenever the skeleton was examined — on a pass too, so the field logs show the
   * margin the gate is passing by and the thresholds can be tuned against real swings
   * instead of guesses.
   */
  gateDetail: string | null;
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
  // Running totals for the quality gate, accumulated over the same samples the union
  // is built from so the two always describe the same stretch of swing.
  const present: Record<string, number> = {};
  const visSum: Record<string, number> = {};
  for (const part of REQUIRED_PARTS) {
    present[part] = 0;
    visSum[part] = 0;
  }

  for (const sample of samples) {
    if (sample.t < startSec || sample.t > finishSec) continue;
    let used = false;
    for (const lm of sample.landmarks) {
      if (!lm) continue;
      if ((lm.visibility ?? 1) < PRESENCE_FLOOR) continue;
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
      if (!lm || (lm.visibility ?? 1) < PRESENCE_FLOOR) continue;
      if (!Number.isFinite(lm.y)) continue;
      const y = clamp(lm.y, 0, 1);
      if (footMaxY === null || y > footMaxY) footMaxY = y;
    }

    if (!used) continue;
    contributing++;
    // One reading per part per sample. For the `feet` OR-group the best-tracked foot
    // landmark speaks for the group — one clearly seen foot is what the gate asks for.
    for (const part of REQUIRED_PARTS) {
      let best = 0;
      for (const idx of PART_LANDMARKS[part]) {
        const lm = sample.landmarks[idx];
        if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) continue;
        const v = lm.visibility ?? 1;
        if (v > best) best = v;
      }
      visSum[part] += best;
      if (best >= PRESENCE_FLOOR) present[part]++;
    }
  }

  if (contributing === 0 || minX === Infinity) return null;

  const skeleton = {} as Record<SkeletonPart, PartQuality>;
  for (const part of REQUIRED_PARTS) {
    skeleton[part] = {
      presentFrac: present[part] / contributing,
      meanVisibility: visSum[part] / contributing,
    };
  }

  return { minX, minY, maxX, maxY, footMaxY, samples: contributing, skeleton };
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
  const whole = (reason: CropReason, detail: string | null = null): CropPlan =>
    finish(null, fit(sourceWidth, sourceHeight, maxOutputSide), 1, reason, detail);

  if (!isPositive(sourceWidth) || !isPositive(sourceHeight)) {
    return finish(null, { width: 1, height: 1 }, 1, 'no-source-size', null);
  }
  if (!bounds) return whole('no-bounds');
  if (bounds.samples < MIN_BOUND_SAMPLES) return whole('too-few-samples');

  // ── Quality gate: is this a real skeleton? ────────────────────────────────
  // Asked before any geometry, because the geometry of a bad skeleton is not worth
  // computing — and because the answer is about the landmarks, never about the box.
  const gate = gateSkeleton(bounds.skeleton);
  if (gate.reason !== 'ok') return whole(gate.reason, gate.detail);

  let left = bounds.minX * sourceWidth;
  let right = bounds.maxX * sourceWidth;
  let top = bounds.minY * sourceHeight;
  let bottom = bounds.maxY * sourceHeight;
  const rawW = right - left;
  const rawH = bottom - top;
  if (!(rawW > 0) || !(rawH > 0)) return whole('box-degenerate', gate.detail);

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
  // Note the asymmetry, and that it is deliberate: the floor is a net under nonsense
  // (see MIN_AREA_FRAC), the ceiling is a genuine "nothing to gain" decision.
  if (areaFrac < MIN_AREA_FRAC) return whole('box-degenerate', gate.detail);
  if (areaFrac > MAX_AREA_FRAC) return whole('box-too-large', gate.detail);

  // Integer rect, re-clamped after rounding so drawImage never reads outside the frame.
  const width = Math.max(1, Math.min(Math.round(w), sourceWidth));
  const height = Math.max(1, Math.min(Math.round(h), sourceHeight));
  const x = Math.max(0, Math.min(Math.round(cx - w / 2), sourceWidth - width));
  const y = Math.max(0, Math.min(Math.round(cy - h / 2), sourceHeight - height));

  return finish(
    { x, y, width, height },
    fit(width, height, maxOutputSide),
    (width * height) / (sourceWidth * sourceHeight),
    'ok',
    gate.detail,
  );
}

/**
 * Test the skeleton the box was derived from. Returns `ok` plus the weakest part's
 * numbers either way — on a pass the margin is the interesting part, because it is what
 * the thresholds get tuned against once there is field data.
 */
function gateSkeleton(skeleton: Record<SkeletonPart, PartQuality>): {
  reason: 'ok' | 'landmarks-incomplete' | 'landmarks-low-confidence';
  detail: string;
} {
  // Absence first: a part that is not there is a different failure from one that is
  // there but uncertain, and reporting the wrong one sends the tuning the wrong way.
  let worstAbsent: SkeletonPart | null = null;
  let worstUnsure: SkeletonPart | null = null;
  for (const part of REQUIRED_PARTS) {
    const q = skeleton[part];
    if (!q) return { reason: 'landmarks-incomplete', detail: `${part} missing` };
    if (q.presentFrac < REQUIRED_PRESENT_FRAC) {
      if (!worstAbsent || q.presentFrac < skeleton[worstAbsent].presentFrac) worstAbsent = part;
    }
    if (q.meanVisibility < REQUIRED_VISIBILITY) {
      if (!worstUnsure || q.meanVisibility < skeleton[worstUnsure].meanVisibility) {
        worstUnsure = part;
      }
    }
  }
  if (worstAbsent) {
    return { reason: 'landmarks-incomplete', detail: describe(worstAbsent, skeleton[worstAbsent]) };
  }
  if (worstUnsure) {
    return {
      reason: 'landmarks-low-confidence',
      detail: describe(worstUnsure, skeleton[worstUnsure]),
    };
  }
  // Passed: report the part with the least headroom on visibility.
  let weakest: SkeletonPart = REQUIRED_PARTS[0];
  for (const part of REQUIRED_PARTS) {
    if (skeleton[part].meanVisibility < skeleton[weakest].meanVisibility) weakest = part;
  }
  return { reason: 'ok', detail: describe(weakest, skeleton[weakest]) };
}

function describe(part: SkeletonPart, q: PartQuality): string {
  return `${part} present ${q.presentFrac.toFixed(2)} vis ${q.meanVisibility.toFixed(2)}`;
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
  gateDetail: string | null,
): CropPlan {
  const outputTokens = estimateImageTokens(output.width, output.height);
  const baselineTokens = estimateImageTokens(BASELINE_FRAME.width, BASELINE_FRAME.height);
  return {
    rect,
    output,
    areaFrac,
    reason,
    gateDetail,
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
