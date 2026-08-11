// Unit tests for the pose-driven crop (Ström E — Vision-kostnad).
//
// Pure-function tests over SYNTHETIC landmarks: we place a "golfer" at known
// normalized coordinates and assert the resulting source-pixel rect. No MediaPipe,
// no video, no canvas.
//
// The cases the crop has to survive in the field, and what each locks in:
//   • normal      — one stable box over the whole swing, output capped, and a real
//                   token saving.
//   • tall golfer — the case that made the crop worthless in production: a tall narrow
//                   body box must produce a tall narrow crop. Under the old lock to the
//                   source's 9:16 this exact box came back as `box-too-large`.
//   • distant     — a COMPLETE skeleton in a SMALL box is accepted. This is the case
//                   the crop exists for (golfer at tripod distance) and the one an
//                   area-based quality floor used to throw away.
//   • bad skeleton— missing or never-confident landmarks are rejected even when the
//                   box itself looks perfectly reasonable. Quality is a property of
//                   the landmarks, not of the rectangle.
//   • near-edge   — a golfer against the frame border: the box stays inside the source
//                   and keeps at least the minimum width.
//   • huge box    — a box covering nearly the whole frame is USED, clamped, never
//                   rejected. "Cropping gains nothing here" is not an error.
//
// THE ASPECT IS NOT ASSERTED AGAINST THE SOURCE any more, in either direction — it is
// asserted against the `MIN_WIDTH_TO_HEIGHT` floor (0.30). A crop that comes back at the
// source's ratio is now the failure, not the goal.

import { describe, it, expect } from 'vitest';
import {
  BASELINE_FRAME,
  MAX_OUTPUT_SIDE,
  computeLandmarkBounds,
  estimateImageTokens,
  planCrop,
  type LandmarkBounds,
  type PartQuality,
  type SkeletonPart,
} from './poseCropBox';
import type { PoseSample } from './poseTrajectory';

const DT = 1 / 15;
const SRC_W = 720;
const SRC_H = 1280;
const SRC_ASPECT = SRC_W / SRC_H;
/** `MIN_WIDTH_TO_HEIGHT` in poseCropBox.ts — the floor that replaced the aspect lock. */
const MIN_ASPECT = 0.3;

interface Pt {
  x: number;
  y: number;
  v?: number;
}

/**
 * Build a PoseSample series from a per-frame map of landmark index → point. Indices
 * not named are emitted with visibility 0, i.e. invisible to the union.
 */
function samplesFrom(frames: Record<number, Pt>[]): PoseSample[] {
  return frames.map((frame, i) => ({
    t: i * DT,
    landmarks: Array.from({ length: 33 }, (_, k) => {
      const p = frame[k];
      return p
        ? { x: p.x, y: p.y, z: 0, visibility: p.v ?? 0.9 }
        : { x: 0, y: 0, z: 0, visibility: 0 };
    }),
  }));
}

/**
 * A plausible golfer: head near the top, wrists swinging left→up→right (so the union
 * is wider than any single frame), feet planted at y = 0.78.
 */
function golferFrames(count: number): Record<number, Pt>[] {
  return Array.from({ length: count }, (_, i) => {
    const phase = i / Math.max(1, count - 1);
    // Wrists sweep 0.34 → 0.60 in x and dip 0.55 → 0.30 → 0.55 in y.
    const wx = 0.34 + 0.26 * phase;
    const wy = 0.55 - 0.25 * Math.sin(Math.PI * phase);
    return {
      0: { x: 0.5, y: 0.24 }, // nose
      11: { x: 0.44, y: 0.34 }, // shoulders
      12: { x: 0.56, y: 0.34 },
      15: { x: wx, y: wy }, // wrists
      16: { x: wx + 0.02, y: wy },
      23: { x: 0.45, y: 0.52 }, // hips
      24: { x: 0.55, y: 0.52 },
      27: { x: 0.44, y: 0.75 }, // ankles
      28: { x: 0.56, y: 0.75 },
      31: { x: 0.43, y: 0.78 }, // toes — the lowest landmarks
      32: { x: 0.57, y: 0.78 },
    };
  });
}

/** A cleanly tracked skeleton, with named parts degraded on demand. */
function skeleton(
  overrides: Partial<Record<SkeletonPart, PartQuality>> = {},
): Record<SkeletonPart, PartQuality> {
  const good: PartQuality = { presentFrac: 1, meanVisibility: 0.9 };
  return {
    leftShoulder: good,
    rightShoulder: good,
    leftHip: good,
    rightHip: good,
    feet: good,
    ...overrides,
  };
}

/** Synthetic bounds with a healthy skeleton unless told otherwise. */
function bounds(partial: Partial<LandmarkBounds> & Pick<LandmarkBounds, 'minX' | 'minY' | 'maxX' | 'maxY'>): LandmarkBounds {
  return {
    footMaxY: partial.maxY,
    samples: 20,
    skeleton: skeleton(),
    ...partial,
  };
}

describe('computeLandmarkBounds', () => {
  it('unions every visible landmark across the envelope, and finds the feet', () => {
    const samples = samplesFrom(golferFrames(20));
    const b = computeLandmarkBounds(samples, 0, samples[samples.length - 1].t)!;

    expect(b).not.toBeNull();
    expect(b.samples).toBe(20);
    // Widest x comes from the LAST frame's wrist, not from any single pose.
    expect(b.minX).toBeCloseTo(0.34, 5);
    expect(b.maxX).toBeCloseTo(0.62, 5);
    expect(b.minY).toBeCloseTo(0.24, 5); // nose
    expect(b.maxY).toBeCloseTo(0.78, 5); // toes
    expect(b.footMaxY).toBeCloseTo(0.78, 5);
  });

  it('summarises per-part tracking quality alongside the box', () => {
    const b = computeLandmarkBounds(samplesFrom(golferFrames(20)), 0, 20)!;
    for (const part of ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'feet'] as const) {
      expect(b.skeleton[part].presentFrac).toBe(1);
      expect(b.skeleton[part].meanVisibility).toBeCloseTo(0.9, 5);
    }
  });

  it('only reads samples inside [startSec, finishSec]', () => {
    // Frame 0 has a stray landmark far left; it must not widen a box for a window
    // that starts after it.
    const frames = golferFrames(10);
    frames[0][15] = { x: 0.02, y: 0.5 };
    const samples = samplesFrom(frames);
    const b = computeLandmarkBounds(samples, samples[1].t, samples[9].t)!;

    expect(b.samples).toBe(9);
    expect(b.minX).toBeGreaterThan(0.3);
  });

  it('ignores low-visibility landmarks (MediaPipe extrapolates off-screen joints)', () => {
    const frames = golferFrames(10);
    // A confident-looking guess in the far corner, but with visibility below the floor.
    frames[5][15] = { x: 0.99, y: 0.02, v: 0.05 };
    const samples = samplesFrom(frames);
    const b = computeLandmarkBounds(samples, 0, samples[9].t)!;

    expect(b.maxX).toBeLessThan(0.7);
    expect(b.minY).toBeCloseTo(0.24, 5);
  });

  it('clamps landmarks that sit outside the frame instead of widening the box', () => {
    const frames = golferFrames(10);
    frames[5][15] = { x: 1.4, y: -0.3 };
    const samples = samplesFrom(frames);
    const b = computeLandmarkBounds(samples, 0, samples[9].t)!;

    expect(b.maxX).toBe(1);
    expect(b.minY).toBe(0);
  });

  it('reports no feet, and zero foot quality, when the feet are never visible', () => {
    const frames = golferFrames(10).map((f) => {
      const rest: Record<number, Pt> = { ...f };
      for (const idx of [27, 28, 29, 30, 31, 32]) delete rest[idx];
      return rest;
    });
    const b = computeLandmarkBounds(samplesFrom(frames), 0, 10)!;

    expect(b.footMaxY).toBeNull();
    expect(b.maxY).toBeCloseTo(0.55, 5); // the wrists at address are now the lowest point
    expect(b.skeleton.feet.presentFrac).toBe(0);
  });

  it('returns null when nothing is visible at all', () => {
    const samples = samplesFrom(Array.from({ length: 10 }, () => ({})));
    expect(computeLandmarkBounds(samples, 0, 10)).toBeNull();
  });

  it('returns null when the window contains no samples', () => {
    const samples = samplesFrom(golferFrames(10));
    expect(computeLandmarkBounds(samples, 100, 200)).toBeNull();
  });
});

describe('planCrop — normal case', () => {
  const b = computeLandmarkBounds(samplesFrom(golferFrames(20)), 0, 20)!;
  const plan = planCrop(b, SRC_W, SRC_H);

  it('crops', () => {
    expect(plan.reason).toBe('ok');
    expect(plan.rect).not.toBeNull();
  });

  it('reports the weakest part even on a pass, so the gate can be tuned on data', () => {
    expect(plan.gateDetail).toMatch(/present 1\.00 vis 0\.90/);
  });

  it('does NOT square itself off to the source ratio — a golfer is narrower than 9:16', () => {
    const r = plan.rect!;
    expect(r.width / r.height).toBeLessThan(SRC_ASPECT);
    expect(r.width / r.height).toBeGreaterThanOrEqual(MIN_ASPECT);
    // The output preserves whatever shape the rect has; `fit` only scales.
    expect(plan.output.width / plan.output.height).toBeCloseTo(r.width / r.height, 2);
    expect(plan.aspect).toBeCloseTo(r.width / r.height, 3);
  });

  it('leaves a naturally wide-enough box alone — the floor only widens, never narrows', () => {
    // This box margins out to ≈ 282 × 829 px, and 282 > 0.30 × 829, so the floor is
    // not reached and the width is exactly what the side margins made it.
    const r = plan.rect!;
    const rawWidth = (b.maxX - b.minX) * SRC_W;
    expect(r.width).toBeCloseTo(rawWidth * 1.4, 0);
  });

  it('stays inside the source frame', () => {
    const r = plan.rect!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(SRC_W);
    expect(r.y + r.height).toBeLessThanOrEqual(SRC_H);
  });

  it('leaves at least 15 % of the raw box width as margin on each side', () => {
    const r = plan.rect!;
    const rawLeft = b.minX * SRC_W;
    const rawRight = b.maxX * SRC_W;
    const rawWidth = rawRight - rawLeft;
    expect(rawLeft - r.x).toBeGreaterThanOrEqual(0.15 * rawWidth);
    expect(r.x + r.width - rawRight).toBeGreaterThanOrEqual(0.15 * rawWidth);
  });

  it('reaches past the feet to the ground so ball position and turf are in frame', () => {
    const r = plan.rect!;
    expect(r.y + r.height).toBeGreaterThan(b.footMaxY! * SRC_H);
  });

  it('caps the longest output side at 900 px, and never upscales below it', () => {
    expect(Math.max(plan.output.width, plan.output.height)).toBeLessThanOrEqual(
      MAX_OUTPUT_SIDE,
    );
    // This box is already shorter than the cap, so it is emitted 1:1 rather than
    // blown up — upscaling would spend tokens on interpolated pixels.
    expect(plan.output.height).toBe(plan.rect!.height);
  });

  it('downscales to the cap when the box IS larger than it', () => {
    // A tall box: 0.2 → 0.8 of a 1280 px frame, which margins out to over 900 px.
    const tall = planCrop(
      bounds({ minX: 0.35, minY: 0.2, maxX: 0.6, maxY: 0.8 }),
      SRC_W,
      SRC_H,
    );
    expect(tall.reason).toBe('ok');
    expect(tall.rect!.height).toBeGreaterThan(MAX_OUTPUT_SIDE);
    expect(tall.output.height).toBe(MAX_OUTPUT_SIDE);
    // This one IS narrow enough to hit the floor, so it comes out at exactly 0.30 —
    // roughly half the width the old 9:16 lock would have forced.
    expect(tall.output.width / tall.output.height).toBeCloseTo(MIN_ASPECT, 2);
  });

  it('saves a meaningful share of the tokens a 720×1280 frame costs', () => {
    expect(plan.baselineTokens).toBe(
      estimateImageTokens(BASELINE_FRAME.width, BASELINE_FRAME.height),
    );
    expect(plan.outputTokens).toBeLessThan(plan.baselineTokens);
    expect(plan.savedPct).toBeGreaterThan(40);
  });

  it('is deterministic — the same bounds give byte-identical framing', () => {
    expect(planCrop(b, SRC_W, SRC_H).rect).toEqual(plan.rect);
  });
});

describe('planCrop — a TALL NARROW golfer gets a tall narrow crop', () => {
  // THE PRODUCTION FAILURE, reproduced. Down-the-line at close range: the body box is
  // ≈ 1143 px of a 1280 px frame high and only ≈ 115 px wide. Locked to the source's
  // 0.5625 that height forced the width out to the full 720 px, so the box covered the
  // entire frame and came back `box-too-large` — two swings in a row logged cropAreaPct
  // 79.6 and 100, i.e. no saving at all. Nothing requires the delivered image to match
  // the source ratio, and this is what it costs to pretend otherwise.
  const tallGolfer = bounds({ minX: 0.42, minY: 0.03, maxX: 0.58, maxY: 0.923 });
  const plan = planCrop(tallGolfer, SRC_W, SRC_H);

  it('crops instead of rejecting the box', () => {
    expect(plan.reason).toBe('ok');
    expect(plan.rect).not.toBeNull();
  });

  it('comes out far narrower than the source ratio, on the minimum-width floor', () => {
    const r = plan.rect!;
    const aspect = r.width / r.height;
    expect(aspect).toBeLessThan(SRC_ASPECT * 0.6);
    // Just above 0.30, not exactly on it: the floor is taken from the box's height
    // BEFORE it is clamped into the frame (1372 px here, clamped to 1280), so a box
    // taller than the frame keeps a little extra width. Generous in the safe direction
    // — more sideways room for the club — and never narrower than the floor.
    expect(aspect).toBeGreaterThanOrEqual(MIN_ASPECT);
    expect(aspect).toBeLessThan(MIN_ASPECT + 0.05);
    expect(plan.aspect).toBeCloseTo(aspect, 3);
  });

  it('keeps the full height — height is never traded away for a ratio', () => {
    expect(plan.rect!.height).toBe(SRC_H);
  });

  it('turns the box the old lock rejected into a real saving', () => {
    // Under the lock this was 100 % of the frame; the width floor puts it near 57 %.
    expect(plan.areaFrac).toBeLessThan(0.6);
    expect(plan.savedPct).toBeGreaterThan(60);
  });

  it('still covers every raw landmark', () => {
    const r = plan.rect!;
    expect(r.x).toBeLessThanOrEqual(tallGolfer.minX * SRC_W);
    expect(r.x + r.width).toBeGreaterThanOrEqual(tallGolfer.maxX * SRC_W);
  });
});

describe('planCrop — a complete skeleton in a SMALL box is accepted', () => {
  // The golfer at tripod distance: the whole body occupies a narrow strip of a 9:16
  // frame. The resulting crop is ~10 % of the frame area — far under the 25 % floor an
  // earlier version used as a quality gate, and exactly the swing cropping is for.
  const distant = bounds({ minX: 0.44, minY: 0.4, maxX: 0.56, maxY: 0.664 });
  const plan = planCrop(distant, SRC_W, SRC_H);

  it('crops rather than falling back to the whole frame', () => {
    expect(plan.reason).toBe('ok');
    expect(plan.rect).not.toBeNull();
  });

  it('lands well below the old 25 % area floor', () => {
    expect(plan.areaFrac).toBeLessThan(0.25);
    expect(plan.areaFrac).toBeGreaterThan(0.04);
  });

  it('is where the saving is largest — the further away, the more background goes', () => {
    expect(plan.savedPct).toBeGreaterThan(40);
    expect(plan.rect!.width / plan.rect!.height).toBeCloseTo(MIN_ASPECT, 2);
  });

  it('still stops at the 4 % net, which no person can be under', () => {
    const speck = planCrop(bounds({ minX: 0.45, minY: 0.45, maxX: 0.55, maxY: 0.55 }), SRC_W, SRC_H);
    expect(speck.areaFrac).toBe(1); // whole frame
    expect(speck.reason).toBe('box-degenerate');
  });
});

describe('planCrop — the gate tests the skeleton, not the box', () => {
  // Same generous, entirely reasonable-looking box in every case below. What decides
  // the outcome is the landmark quality behind it.
  const box = { minX: 0.3, minY: 0.2, maxX: 0.7, maxY: 0.8 };

  it('accepts it with a healthy skeleton (the control)', () => {
    expect(planCrop(bounds(box), SRC_W, SRC_H).reason).toBe('ok');
  });

  it('rejects a large box when a required part is absent for most of the swing', () => {
    const plan = planCrop(
      bounds({
        ...box,
        skeleton: skeleton({ leftHip: { presentFrac: 0.2, meanVisibility: 0.18 } }),
      }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('landmarks-incomplete');
    expect(plan.rect).toBeNull();
    expect(plan.gateDetail).toBe('leftHip present 0.20 vis 0.18');
  });

  it('rejects it when no foot is tracked — the box has no ground to reach for', () => {
    const plan = planCrop(
      bounds({ ...box, skeleton: skeleton({ feet: { presentFrac: 0, meanVisibility: 0 } }) }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('landmarks-incomplete');
    expect(plan.gateDetail).toBe('feet present 0.00 vis 0.00');
  });

  it('accepts one foot: the feet group is an OR, not both ankles', () => {
    const samples = samplesFrom(
      golferFrames(20).map((f) => {
        const rest: Record<number, Pt> = { ...f };
        for (const idx of [28, 32]) delete rest[idx]; // right foot gone entirely
        return rest;
      }),
    );
    const b = computeLandmarkBounds(samples, 0, 20)!;
    expect(b.skeleton.feet.presentFrac).toBe(1);
    expect(planCrop(b, SRC_W, SRC_H).reason).toBe('ok');
  });

  it('rejects present-but-never-confident landmarks, with its own reason', () => {
    const plan = planCrop(
      bounds({
        ...box,
        // Above the presence floor in every sample, so nothing is "missing" — but the
        // tracker never got above a coin flip on it.
        skeleton: skeleton({ rightShoulder: { presentFrac: 1, meanVisibility: 0.35 } }),
      }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('landmarks-low-confidence');
    expect(plan.rect).toBeNull();
    expect(plan.gateDetail).toBe('rightShoulder present 1.00 vis 0.35');
  });

  it('reports absence before uncertainty when both are wrong', () => {
    const plan = planCrop(
      bounds({
        ...box,
        skeleton: skeleton({
          leftHip: { presentFrac: 0.1, meanVisibility: 0.1 },
          rightShoulder: { presentFrac: 1, meanVisibility: 0.4 },
        }),
      }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('landmarks-incomplete');
  });

  it('tolerates an occlusion dip: briefly hidden is not untracked', () => {
    const plan = planCrop(
      bounds({
        ...box,
        // Hidden for a third of the swing (trailing hip at the top), confident otherwise.
        skeleton: skeleton({ leftHip: { presentFrac: 0.67, meanVisibility: 0.66 } }),
      }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('ok');
  });

  it('end to end: low-visibility hips in the samples reach the gate as low confidence', () => {
    const frames = golferFrames(20).map((f) => ({
      ...f,
      23: { ...f[23], v: 0.35 },
      24: { ...f[24], v: 0.35 },
    }));
    const b = computeLandmarkBounds(samplesFrom(frames), 0, 20)!;
    const plan = planCrop(b, SRC_W, SRC_H);

    expect(plan.reason).toBe('landmarks-low-confidence');
    expect(plan.rect).toBeNull();
  });

  it('end to end: hips missing from the samples reach the gate as incomplete', () => {
    const frames = golferFrames(20).map((f) => {
      const rest: Record<number, Pt> = { ...f };
      delete rest[23];
      delete rest[24];
      return rest;
    });
    const b = computeLandmarkBounds(samplesFrom(frames), 0, 20)!;

    expect(planCrop(b, SRC_W, SRC_H).reason).toBe('landmarks-incomplete');
  });
});

describe('planCrop — other fallbacks to the whole frame', () => {
  const wholeFrame = (plan: ReturnType<typeof planCrop>) => {
    expect(plan.rect).toBeNull();
    expect(plan.areaFrac).toBe(1);
  };

  it('no bounds at all', () => {
    const plan = planCrop(null, SRC_W, SRC_H);
    expect(plan.reason).toBe('no-bounds');
    wholeFrame(plan);
  });

  it('too few contributing samples — one lucky frame is not a swing', () => {
    const plan = planCrop(
      bounds({ minX: 0.3, minY: 0.2, maxX: 0.7, maxY: 0.8, samples: 2 }),
      SRC_W,
      SRC_H,
    );
    expect(plan.reason).toBe('too-few-samples');
    wholeFrame(plan);
  });

  it('degenerate box (zero width)', () => {
    const plan = planCrop(bounds({ minX: 0.5, minY: 0.2, maxX: 0.5, maxY: 0.8 }), SRC_W, SRC_H);
    expect(plan.reason).toBe('box-degenerate');
    wholeFrame(plan);
  });

  it('unknown source size (video metadata not loaded)', () => {
    const plan = planCrop(null, 0, 0);
    expect(plan.reason).toBe('no-source-size');
    expect(plan.rect).toBeNull();
  });

  it('a whole-frame fallback still honours the output cap', () => {
    const plan = planCrop(null, SRC_W, SRC_H, MAX_OUTPUT_SIDE);
    expect(Math.max(plan.output.width, plan.output.height)).toBe(MAX_OUTPUT_SIDE);
    expect(plan.output.width / plan.output.height).toBeCloseTo(SRC_ASPECT, 2);
  });
});

describe('planCrop — a very large box is USED, not rejected', () => {
  // There is no upper area gate any more. A box that covers nearly the whole frame is
  // not a fault: it means the golfer fills the frame and cropping buys little. The
  // honest response is to send that box — rejecting it sent the whole frame anyway,
  // which is the same pixels via a path that reported a failure.
  it('accepts a box covering ~95 % of the frame and crops to it', () => {
    const plan = planCrop(bounds({ minX: 0.15, minY: 0.09, maxX: 0.845, maxY: 0.9 }), SRC_W, SRC_H);
    expect(plan.reason).toBe('ok');
    expect(plan.rect).not.toBeNull();
    expect(plan.areaFrac).toBeGreaterThan(0.9);
    expect(plan.areaFrac).toBeLessThan(1);
    const r = plan.rect!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(SRC_W);
    expect(r.y + r.height).toBeLessThanOrEqual(SRC_H);
  });

  it('clamps a box that overflows the frame on every side, and still crops', () => {
    const plan = planCrop(bounds({ minX: 0.02, minY: 0.02, maxX: 0.98, maxY: 0.98 }), SRC_W, SRC_H);
    expect(plan.reason).toBe('ok');
    // Margins push this well past the frame in both axes; clamping lands it exactly on
    // the frame, which is the whole image — arrived at by using the box, not by failing.
    expect(plan.rect).toEqual({ x: 0, y: 0, width: SRC_W, height: SRC_H });
    expect(plan.areaFrac).toBe(1);
  });

  it('clamps each axis independently — an overflowing width costs no height', () => {
    // Wide and tall: the width overflows, the height does not. Under the aspect lock a
    // single scale factor shrank BOTH, so overhanging sideways used to cost real height.
    const plan = planCrop(bounds({ minX: 0.05, minY: 0.3, maxX: 0.95, maxY: 0.72 }), SRC_W, SRC_H);
    expect(plan.reason).toBe('ok');
    const r = plan.rect!;
    expect(r.width).toBe(SRC_W);
    // 0.42 × 1280 raw height + the 12 %/8 % margins, untouched by the width clamp.
    expect(r.height).toBeCloseTo(1.2 * 0.42 * SRC_H, 0);
  });
});

describe('planCrop — landmarks near the frame edge', () => {
  const cases: [string, LandmarkBounds][] = [
    ['hard against the left edge', bounds({ minX: 0, minY: 0.2, maxX: 0.3, maxY: 0.85 })],
    ['hard against the right edge', bounds({ minX: 0.7, minY: 0.2, maxX: 1, maxY: 0.85 })],
    ['feet on the bottom edge', bounds({ minX: 0.3, minY: 0.3, maxX: 0.7, maxY: 1 })],
    ['head on the top edge', bounds({ minX: 0.3, minY: 0, maxX: 0.7, maxY: 0.7 })],
    ['spanning the full height', bounds({ minX: 0.3, minY: 0, maxX: 0.7, maxY: 1 })],
  ];

  for (const [name, b] of cases) {
    it(`${name}: rect stays inside the source and keeps the minimum width`, () => {
      const plan = planCrop(b, SRC_W, SRC_H);
      if (!plan.rect) {
        // A legitimate outcome, but never a silent one. Only the floor can produce it
        // now — there is no upper area gate left.
        expect(plan.reason).toBe('box-degenerate');
        return;
      }
      const r = plan.rect;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.x + r.width).toBeLessThanOrEqual(SRC_W);
      expect(r.y + r.height).toBeLessThanOrEqual(SRC_H);
      // The invariant that replaced the aspect lock. It survives clamping: clamping the
      // width only ever happens at the frame edge, where the frame's own ratio (0.5625)
      // is already above the floor.
      expect(r.width / r.height).toBeGreaterThanOrEqual(MIN_ASPECT - 0.01);
    });
  }

  it('never crops the golfer out when the box hangs over an edge — it slides, not shrinks', () => {
    // Wrists pinned to the left edge; the margined box would start at a negative x.
    const b = bounds({ minX: 0, minY: 0.25, maxX: 0.28, maxY: 0.8 });
    const plan = planCrop(b, SRC_W, SRC_H);
    expect(plan.reason).toBe('ok');
    const r = plan.rect!;
    expect(r.x).toBe(0);
    // Every raw landmark is still covered.
    expect(r.x + r.width).toBeGreaterThanOrEqual(b.maxX * SRC_W);
    expect(r.y).toBeLessThanOrEqual(b.minY * SRC_H);
    expect(r.y + r.height).toBeGreaterThanOrEqual(b.maxY * SRC_H);
  });

  it('a landscape source does not impose ITS shape either — the box is the box', () => {
    const plan = planCrop(bounds({ minX: 0.35, minY: 0.2, maxX: 0.65, maxY: 0.7 }), 1920, 1080);
    expect(plan.rect).not.toBeNull();
    const aspect = plan.rect!.width / plan.rect!.height;
    // The margins alone decide it: 1.4 × 576 wide by 1.2 × 540 high.
    expect(aspect).toBeCloseTo((1.4 * 0.3 * 1920) / (1.2 * 0.5 * 1080), 2);
    expect(aspect).not.toBeCloseTo(1920 / 1080, 2);
    expect(Math.max(plan.output.width, plan.output.height)).toBeLessThanOrEqual(
      MAX_OUTPUT_SIDE,
    );
  });
});

describe('ground reach', () => {
  it('reaches further down when no foot landmark was ever visible', () => {
    // DEFENSIVE branch: with the landmark gate in place, `footMaxY === null` implies
    // feet were never tracked, which the gate now rejects before the geometry runs. The
    // branch stays because planCrop is a total function over whatever bounds it is
    // handed — this test pins its behaviour, not a production path.
    const base = { minX: 0.35, minY: 0.15, maxX: 0.65, maxY: 0.75 };
    const withFeet = planCrop(bounds({ ...base, footMaxY: 0.75 }), SRC_W, SRC_H);
    const withoutFeet = planCrop(bounds({ ...base, footMaxY: null }), SRC_W, SRC_H);

    expect(withFeet.rect).not.toBeNull();
    expect(withoutFeet.rect).not.toBeNull();
    const bottom = (p: typeof withFeet) => p.rect!.y + p.rect!.height;
    expect(bottom(withoutFeet)).toBeGreaterThan(bottom(withFeet));
  });
});
