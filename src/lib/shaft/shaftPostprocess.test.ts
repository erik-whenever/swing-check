// Unit tests for the raw-output decoder and NMS (shaftPostprocess.ts).
//
// Hand-built tensors, not a recorded model run: the thing worth pinning is the
// CHANNEL LAYOUT and the threshold semantics, and a golden buffer from the real
// model would pass just as happily with the channels transposed.
//
// TWO LAYOUTS ARE PINNED. The schema is four points (17 channels); the shipped
// checkpoint is two (11 channels). Both have to decode, and — the part that is easy to
// get wrong — a legacy buffer must yield `toe: null`, NOT a keypoint at the origin with
// score 0. The difference matters downstream: a null is "no point", a zero-score point
// is "a point the threshold rejected", and only one of those is true here.

import { describe, it, expect } from 'vitest';
import {
  CHANNELS,
  LEGACY_CHANNELS,
  decodeCandidates,
  iou,
  keypointCountForChannels,
  nms,
  selectBest,
  type Candidate,
} from './shaftPostprocess';

/** One anchor's channels, in the export's documented order. */
interface Anchor {
  cx: number;
  cy: number;
  w: number;
  h: number;
  conf: number;
  buttX: number;
  buttY: number;
  buttV: number;
  hoselX: number;
  hoselY: number;
  hoselV: number;
  toeX: number;
  toeY: number;
  toeV: number;
  heelX: number;
  heelY: number;
  heelV: number;
}

function anchor(partial: Partial<Anchor> = {}): Anchor {
  return {
    cx: 480, cy: 480, w: 100, h: 400, conf: 0.9,
    buttX: 450, buttY: 300, buttV: 0.95,
    hoselX: 510, hoselY: 660, hoselV: 0.88,
    toeX: 540, toeY: 690, toeV: 0.72,
    heelX: 505, heelY: 668, heelV: 0.64,
    ...partial,
  };
}

/**
 * Build a `[1, C, N]` buffer in the graph's CHANNEL-MAJOR layout: channel c of
 * anchor i at `data[c * N + i]`. Writing it the other way round is the mistake the
 * decoder is being tested against, so the packing here is spelled out.
 *
 * `keypoints: 2` packs the legacy 11-channel layout by simply stopping after hosel —
 * which is exactly what an older graph emits.
 */
function pack(anchors: Anchor[], keypoints: 2 | 4 = 4): Float32Array {
  const n = anchors.length;
  const channels = 5 + 3 * keypoints;
  const data = new Float32Array(channels * n);
  anchors.forEach((a, i) => {
    const values = [
      a.cx, a.cy, a.w, a.h, a.conf,
      a.buttX, a.buttY, a.buttV,
      a.hoselX, a.hoselY, a.hoselV,
      a.toeX, a.toeY, a.toeV,
      a.heelX, a.heelY, a.heelV,
    ].slice(0, channels);
    values.forEach((v, c) => {
      data[c * n + i] = v;
    });
  });
  return data;
}

describe('channel counts', () => {
  it('names 17 as the four-point schema and 11 as the legacy two-point one', () => {
    expect(CHANNELS).toBe(17);
    expect(LEGACY_CHANNELS).toBe(11);
    expect(keypointCountForChannels(17)).toBe(4);
    expect(keypointCountForChannels(11)).toBe(2);
  });

  it('refuses every other channel count rather than guessing a layout', () => {
    expect(keypointCountForChannels(14)).toBeNull();
    expect(keypointCountForChannels(8)).toBeNull();
    expect(keypointCountForChannels(20)).toBeNull();
  });
});

describe('decodeCandidates', () => {
  it('reads the documented channel order and converts centre-form to corners', () => {
    const data = pack([anchor({ cx: 500, cy: 400, w: 60, h: 200 })]);
    const [c] = decodeCandidates(data, 1);
    expect(c).toMatchObject({ x1: 470, y1: 300, x2: 530, y2: 500 });
    // float32 round-trip: 0.9 comes back as 0.899999976.
    expect(c.conf).toBeCloseTo(0.9, 6);
    expect(c.butt).toMatchObject({ x: 450, y: 300 });
    expect(c.butt.score).toBeCloseTo(0.95, 6);
    expect(c.hosel).toMatchObject({ x: 510, y: 660 });
    expect(c.hosel.score).toBeCloseTo(0.88, 6);
    expect(c.toe).toMatchObject({ x: 540, y: 690 });
    expect(c.toe?.score).toBeCloseTo(0.72, 6);
    expect(c.heel).toMatchObject({ x: 505, y: 668 });
    expect(c.heel?.score).toBeCloseTo(0.64, 6);
  });

  it('reads a legacy 11-channel buffer and reports toe/heel as null, not as (0,0)', () => {
    const data = pack([anchor()], 2);
    expect(data).toHaveLength(LEGACY_CHANNELS);
    const [c] = decodeCandidates(data, 1);
    expect(c.butt).toMatchObject({ x: 450, y: 300 });
    expect(c.hosel).toMatchObject({ x: 510, y: 660 });
    expect(c.toe).toBeNull();
    expect(c.heel).toBeNull();
  });

  it('does not let a 4-point buffer and a 2-point one decode to the same thing', () => {
    const four = decodeCandidates(pack([anchor()], 4), 1)[0];
    const two = decodeCandidates(pack([anchor()], 2), 1)[0];
    expect(four.hosel).toEqual(two.hosel);
    expect(four.toe).not.toBeNull();
    expect(two.toe).toBeNull();
  });

  it('keeps each anchor on its own channel stride', () => {
    const data = pack([
      anchor({ cx: 100, conf: 0.8, buttX: 11, heelX: 111 }),
      anchor({ cx: 800, conf: 0.7, buttX: 22, heelX: 222 }),
    ]);
    const decoded = decodeCandidates(data, 2);
    expect(decoded).toHaveLength(2);
    expect(decoded[0].butt.x).toBe(11);
    expect(decoded[1].butt.x).toBe(22);
    expect(decoded[0].heel?.x).toBe(111);
    expect(decoded[1].heel?.x).toBe(222);
    expect(decoded[1].conf).toBeCloseTo(0.7);
  });

  it('drops anchors below the confidence threshold, keeps the boundary', () => {
    const data = pack([
      anchor({ conf: 0.24 }),
      anchor({ conf: 0.25 }),
      anchor({ conf: 0.26 }),
    ]);
    const confs = decodeCandidates(data, 3).map((c) => Math.round(c.conf * 100) / 100);
    expect(confs).toEqual([0.25, 0.26]);
  });

  it('returns nothing when the whole grid is background', () => {
    const data = pack([anchor({ conf: 0.01 }), anchor({ conf: 0.0 })]);
    expect(decodeCandidates(data, 2)).toEqual([]);
  });

  it('refuses a buffer whose channel count is neither layout', () => {
    // 42 = 14 × 3: a whole number of channels, but 3 keypoints — not a model we read.
    expect(() => decodeCandidates(new Float32Array(42), 3)).toThrow(/wrong model/);
  });

  it('refuses a buffer that is not a whole number of channels', () => {
    expect(() => decodeCandidates(new Float32Array(31), 3)).toThrow(/wrong model/);
  });
});

describe('iou / nms', () => {
  const box = (x1: number, y1: number, x2: number, y2: number, conf: number): Candidate => ({
    x1, y1, x2, y2, conf,
    butt: { x: 0, y: 0, score: 1 },
    hosel: { x: 0, y: 0, score: 1 },
    toe: { x: 0, y: 0, score: 1 },
    heel: { x: 0, y: 0, score: 1 },
  });

  it('is 1 for identical boxes and 0 for disjoint ones', () => {
    expect(iou(box(0, 0, 10, 10, 1), box(0, 0, 10, 10, 1))).toBe(1);
    expect(iou(box(0, 0, 10, 10, 1), box(20, 20, 30, 30, 1))).toBe(0);
    // Touching edges are not overlapping.
    expect(iou(box(0, 0, 10, 10, 1), box(10, 0, 20, 10, 1))).toBe(0);
  });

  it('computes a half-overlap correctly', () => {
    // 10×10 and 10×10 sharing a 5×10 strip: 50 / (100 + 100 - 50) = 1/3.
    expect(iou(box(0, 0, 10, 10, 1), box(5, 0, 15, 10, 1))).toBeCloseTo(1 / 3, 6);
  });

  it('suppresses overlapping boxes and keeps the most confident', () => {
    const kept = nms([
      box(0, 0, 10, 10, 0.6),
      box(1, 1, 11, 11, 0.9),
      box(0.5, 0.5, 10.5, 10.5, 0.7),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].conf).toBe(0.9);
  });

  it('keeps two genuinely separate clubs', () => {
    const kept = nms([box(0, 0, 10, 10, 0.9), box(100, 100, 110, 110, 0.5)]);
    expect(kept.map((k) => k.conf)).toEqual([0.9, 0.5]);
  });

  it('does not mutate its input order', () => {
    const input = [box(0, 0, 10, 10, 0.3), box(50, 50, 60, 60, 0.9)];
    nms(input);
    expect(input.map((b) => b.conf)).toEqual([0.3, 0.9]);
  });
});

describe('selectBest', () => {
  it('returns the highest-confidence club and reports the counts', () => {
    const data = pack([
      anchor({ cx: 480, conf: 0.4, buttX: 1 }),
      anchor({ cx: 482, conf: 0.8, buttX: 2 }), // same club, better anchor
      anchor({ cx: 100, conf: 0.1 }), // below threshold
    ]);
    const { best, kept, candidates } = selectBest(data, 3);
    expect(candidates).toBe(2);
    expect(kept).toBe(1);
    expect(best?.butt.x).toBe(2);
  });

  it('returns null when nothing clears the confidence threshold', () => {
    const data = pack([anchor({ conf: 0.1 }), anchor({ conf: 0.2 })]);
    expect(selectBest(data, 2).best).toBeNull();
  });

  it('honours overridden thresholds', () => {
    const data = pack([anchor({ conf: 0.2 })]);
    expect(selectBest(data, 1).best).toBeNull();
    expect(selectBest(data, 1, { confThreshold: 0.1 }).best).not.toBeNull();
  });

  it('works unchanged on a legacy two-point buffer', () => {
    const { best } = selectBest(pack([anchor({ conf: 0.9 })], 2), 1);
    expect(best?.butt.x).toBe(450);
    expect(best?.toe).toBeNull();
  });
});
