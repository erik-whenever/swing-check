// Unit tests for the pose-driven crop (Ström E — Vision-kostnad).
//
// Pure-function tests over SYNTHETIC landmarks: we place a "golfer" at known
// normalized coordinates and assert the resulting source-pixel rect. No MediaPipe,
// no video, no canvas.
//
// The three cases the crop has to survive in the field, and what each locks in:
//   • normal      — one stable box over the whole swing, aspect preserved, output
//                   capped, and a real token saving.
//   • missing     — no landmarks / too few samples / a degenerate box: fall back to
//                   the whole frame with a REASON, never a bad crop.
//   • near-edge   — a golfer against the frame border: the box stays inside the
//                   source and keeps its aspect exactly.

import { describe, it, expect } from 'vitest';
import {
  BASELINE_FRAME,
  MAX_OUTPUT_SIDE,
  computeLandmarkBounds,
  estimateImageTokens,
  planCrop,
  type LandmarkBounds,
} from './poseCropBox';
import type { PoseSample } from './poseTrajectory';

const DT = 1 / 15;
const SRC_W = 720;
const SRC_H = 1280;
const SRC_ASPECT = SRC_W / SRC_H;

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

  it('reports no feet when the foot landmarks are never visible', () => {
    const frames = golferFrames(10).map((f) => {
      const rest: Record<number, Pt> = { ...f };
      for (const idx of [27, 28, 29, 30, 31, 32]) delete rest[idx];
      return rest;
    });
    const b = computeLandmarkBounds(samplesFrom(frames), 0, 10)!;

    expect(b.footMaxY).toBeNull();
    expect(b.maxY).toBeCloseTo(0.55, 5); // the wrists at address are now the lowest point
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
  const bounds = computeLandmarkBounds(samplesFrom(golferFrames(20)), 0, 20)!;
  const plan = planCrop(bounds, SRC_W, SRC_H);

  it('crops', () => {
    expect(plan.reason).toBe('cropped');
    expect(plan.rect).not.toBeNull();
  });

  it('keeps the source aspect ratio (9:16) so nothing is scaled unevenly', () => {
    const r = plan.rect!;
    expect(r.width / r.height).toBeCloseTo(SRC_ASPECT, 2);
    expect(plan.output.width / plan.output.height).toBeCloseTo(SRC_ASPECT, 2);
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
    const rawLeft = bounds.minX * SRC_W;
    const rawRight = bounds.maxX * SRC_W;
    const rawWidth = rawRight - rawLeft;
    expect(rawLeft - r.x).toBeGreaterThanOrEqual(0.15 * rawWidth);
    expect(r.x + r.width - rawRight).toBeGreaterThanOrEqual(0.15 * rawWidth);
  });

  it('reaches past the feet to the ground so ball position and turf are in frame', () => {
    const r = plan.rect!;
    expect(r.y + r.height).toBeGreaterThan(bounds.footMaxY! * SRC_H);
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
      { minX: 0.35, minY: 0.2, maxX: 0.6, maxY: 0.8, footMaxY: 0.8, samples: 20 },
      SRC_W,
      SRC_H,
    );
    expect(tall.reason).toBe('cropped');
    expect(tall.rect!.height).toBeGreaterThan(MAX_OUTPUT_SIDE);
    expect(tall.output.height).toBe(MAX_OUTPUT_SIDE);
    expect(tall.output.width / tall.output.height).toBeCloseTo(SRC_ASPECT, 2);
  });

  it('saves a meaningful share of the tokens a 720×1280 frame costs', () => {
    expect(plan.baselineTokens).toBe(
      estimateImageTokens(BASELINE_FRAME.width, BASELINE_FRAME.height),
    );
    expect(plan.outputTokens).toBeLessThan(plan.baselineTokens);
    expect(plan.savedPct).toBeGreaterThan(40);
  });

  it('is deterministic — the same bounds give byte-identical framing', () => {
    expect(planCrop(bounds, SRC_W, SRC_H).rect).toEqual(plan.rect);
  });
});

describe('planCrop — missing or unreasonable landmarks fall back to the whole frame', () => {
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
    const bounds: LandmarkBounds = {
      minX: 0.3,
      minY: 0.2,
      maxX: 0.7,
      maxY: 0.8,
      footMaxY: 0.8,
      samples: 2,
    };
    const plan = planCrop(bounds, SRC_W, SRC_H);
    expect(plan.reason).toBe('too-few-samples');
    wholeFrame(plan);
  });

  it('degenerate box (zero width)', () => {
    const bounds: LandmarkBounds = {
      minX: 0.5,
      minY: 0.2,
      maxX: 0.5,
      maxY: 0.8,
      footMaxY: 0.8,
      samples: 20,
    };
    const plan = planCrop(bounds, SRC_W, SRC_H);
    expect(plan.reason).toBe('degenerate');
    wholeFrame(plan);
  });

  it('box below the 25 % area floor — the landmarks are almost certainly wrong', () => {
    const bounds: LandmarkBounds = {
      minX: 0.48,
      minY: 0.48,
      maxX: 0.52,
      maxY: 0.55,
      footMaxY: 0.55,
      samples: 20,
    };
    const plan = planCrop(bounds, SRC_W, SRC_H);
    expect(plan.reason).toBe('too-small');
    wholeFrame(plan);
  });

  it('box above the 90 % area ceiling — nothing worth cropping', () => {
    const bounds: LandmarkBounds = {
      minX: 0.02,
      minY: 0.02,
      maxX: 0.98,
      maxY: 0.98,
      footMaxY: 0.98,
      samples: 20,
    };
    const plan = planCrop(bounds, SRC_W, SRC_H);
    expect(plan.reason).toBe('too-large');
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

describe('planCrop — landmarks near the frame edge', () => {
  const cases: [string, LandmarkBounds][] = [
    [
      'hard against the left edge',
      { minX: 0, minY: 0.2, maxX: 0.3, maxY: 0.85, footMaxY: 0.85, samples: 20 },
    ],
    [
      'hard against the right edge',
      { minX: 0.7, minY: 0.2, maxX: 1, maxY: 0.85, footMaxY: 0.85, samples: 20 },
    ],
    [
      'feet on the bottom edge',
      { minX: 0.3, minY: 0.3, maxX: 0.7, maxY: 1, footMaxY: 1, samples: 20 },
    ],
    [
      'head on the top edge',
      { minX: 0.3, minY: 0, maxX: 0.7, maxY: 0.7, footMaxY: 0.7, samples: 20 },
    ],
    [
      'spanning the full height',
      { minX: 0.3, minY: 0, maxX: 0.7, maxY: 1, footMaxY: 1, samples: 20 },
    ],
  ];

  for (const [name, bounds] of cases) {
    it(`${name}: rect stays inside the source and keeps the aspect`, () => {
      const plan = planCrop(bounds, SRC_W, SRC_H);
      if (!plan.rect) {
        // A legitimate outcome (too-large), but never a silent one.
        expect(['too-large', 'too-small']).toContain(plan.reason);
        return;
      }
      const r = plan.rect;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.x + r.width).toBeLessThanOrEqual(SRC_W);
      expect(r.y + r.height).toBeLessThanOrEqual(SRC_H);
      expect(r.width / r.height).toBeCloseTo(SRC_ASPECT, 2);
    });
  }

  it('never crops the golfer out when the box hangs over an edge — it slides, not shrinks', () => {
    // Wrists pinned to the left edge; the margined box would start at a negative x.
    const bounds: LandmarkBounds = {
      minX: 0.0,
      minY: 0.25,
      maxX: 0.28,
      maxY: 0.8,
      footMaxY: 0.8,
      samples: 20,
    };
    const plan = planCrop(bounds, SRC_W, SRC_H);
    expect(plan.reason).toBe('cropped');
    const r = plan.rect!;
    expect(r.x).toBe(0);
    // Every raw landmark is still covered.
    expect(r.x + r.width).toBeGreaterThanOrEqual(bounds.maxX * SRC_W);
    expect(r.y).toBeLessThanOrEqual(bounds.minY * SRC_H);
    expect(r.y + r.height).toBeGreaterThanOrEqual(bounds.maxY * SRC_H);
  });

  it('a landscape source locks to ITS aspect, not to 9:16', () => {
    const bounds: LandmarkBounds = {
      minX: 0.35,
      minY: 0.2,
      maxX: 0.65,
      maxY: 0.7,
      footMaxY: 0.7,
      samples: 20,
    };
    const plan = planCrop(bounds, 1920, 1080);
    expect(plan.rect).not.toBeNull();
    expect(plan.rect!.width / plan.rect!.height).toBeCloseTo(1920 / 1080, 2);
    expect(Math.max(plan.output.width, plan.output.height)).toBeLessThanOrEqual(
      MAX_OUTPUT_SIDE,
    );
  });
});

describe('ground reach', () => {
  it('reaches further down when no foot landmark was ever visible', () => {
    const base = { minX: 0.35, minY: 0.15, maxX: 0.65, maxY: 0.75, samples: 20 };
    const withFeet = planCrop({ ...base, footMaxY: 0.75 }, SRC_W, SRC_H);
    const withoutFeet = planCrop({ ...base, footMaxY: null }, SRC_W, SRC_H);

    expect(withFeet.rect).not.toBeNull();
    expect(withoutFeet.rect).not.toBeNull();
    const bottom = (p: typeof withFeet) => p.rect!.y + p.rect!.height;
    expect(bottom(withoutFeet)).toBeGreaterThan(bottom(withFeet));
  });
});
