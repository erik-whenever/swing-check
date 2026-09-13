// Tests for the agreement measurement (scripts/measure-calibration.mjs).
//
// The numbers this script prints decide whether production annotation starts, so the
// things worth pinning down are the ones that would be wrong QUIETLY: a percentile
// estimator that disagrees with the numpy anyone re-checks in, an angle difference that
// folds a swapped-endpoints blunder into 0°, and the v≥1 rule that decides which points
// are even compared. Synthetic data throughout — the real exports are gitignored
// personal data and would make the test depend on someone's annotation session.

import { describe, it, expect } from 'vitest';
import {
  distance,
  percentile,
  summarize,
  shaftAngleDeg,
  angleDiffDeg,
  frameIdFromFileName,
  parseCoco,
  verifyVisibility,
  compare,
  POINTS,
} from './measure-calibration.mjs';

describe('distance', () => {
  it('is the euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: -1, y: -1 }, { x: 2, y: 3 })).toBe(5);
  });

  it('is zero for coincident points and symmetric otherwise', () => {
    const a = { x: 12.5, y: -3 };
    const b = { x: 100, y: 7.25 };
    expect(distance(a, a)).toBe(0);
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 12);
  });
});

describe('percentile', () => {
  it('returns null for an empty sample', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('returns the single value for a one-element sample, at any p', () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 100)).toBe(7);
  });

  it('interpolates linearly between closest ranks (numpy `linear` / R type 7)', () => {
    const v = [1, 2, 3, 4];
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 100)).toBe(4);
    expect(percentile(v, 50)).toBeCloseTo(2.5, 12); // rank 1.5 → halfway 2..3
    expect(percentile(v, 25)).toBeCloseTo(1.75, 12); // rank 0.75
    expect(percentile(v, 90)).toBeCloseTo(3.7, 12); // rank 2.7
  });

  it('lands exactly on a sample when the rank is integral', () => {
    // 11 values → p90 is rank 9 exactly, no interpolation.
    expect(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });

  it('sorts the input and does not mutate it', () => {
    const v = [5, 1, 4, 2, 3];
    expect(percentile(v, 50)).toBe(3);
    expect(v).toEqual([5, 1, 4, 2, 3]);
  });

  it('sorts numerically, not lexicographically', () => {
    // The default Array#sort would order these as 10, 2, 9 and return 2.
    expect(percentile([10, 2, 9], 50)).toBe(9);
  });
});

describe('summarize', () => {
  it('reports n, median, p90 and max', () => {
    const s = summarize([4, 1, 3, 2]);
    expect(s.n).toBe(4);
    expect(s.median).toBeCloseTo(2.5, 12);
    expect(s.p90).toBeCloseTo(3.7, 12);
    expect(s.max).toBe(4);
  });

  it('is all-null but for n on an empty sample, so empty buckets render as "–"', () => {
    expect(summarize([])).toEqual({ n: 0, median: null, p90: null, max: null });
  });
});

describe('shaftAngleDeg', () => {
  const butt = { x: 0, y: 0 };

  it('measures butt → hosel clockwise-positive, because image y runs down', () => {
    expect(shaftAngleDeg(butt, { x: 10, y: 0 })).toBeCloseTo(0, 12); // right
    expect(shaftAngleDeg(butt, { x: 0, y: 10 })).toBeCloseTo(90, 12); // down the image
    expect(shaftAngleDeg(butt, { x: 0, y: -10 })).toBeCloseTo(-90, 12); // up the image
    expect(Math.abs(shaftAngleDeg(butt, { x: -10, y: 0 }))).toBeCloseTo(180, 12);
  });

  it('is scale-invariant — only the direction matters', () => {
    expect(shaftAngleDeg(butt, { x: 3, y: 3 })).toBeCloseTo(shaftAngleDeg(butt, { x: 300, y: 300 }), 12);
  });

  it('is translation-invariant', () => {
    const a = shaftAngleDeg({ x: 0, y: 0 }, { x: 4, y: 7 });
    const b = shaftAngleDeg({ x: 500, y: -20 }, { x: 504, y: -13 });
    expect(a).toBeCloseTo(b, 12);
  });
});

describe('angleDiffDeg', () => {
  it('is zero for identical directions', () => {
    expect(angleDiffDeg(37.5, 37.5)).toBe(0);
  });

  it('wraps across the ±180 seam instead of reporting ~358°', () => {
    expect(angleDiffDeg(179, -179)).toBeCloseTo(2, 12);
    expect(angleDiffDeg(-179, 179)).toBeCloseTo(2, 12);
    expect(angleDiffDeg(350, 10)).toBeCloseTo(20, 12);
  });

  it('does NOT fold at 90° — swapped endpoints must surface as 180°, not 0°', () => {
    const butt = { x: 10, y: 10 };
    const hosel = { x: 60, y: 90 };
    const correct = shaftAngleDeg(butt, hosel);
    const swapped = shaftAngleDeg(hosel, butt);
    expect(angleDiffDeg(correct, swapped)).toBeCloseTo(180, 10);
  });

  it('is symmetric and always within [0, 180]', () => {
    for (let a = -720; a <= 720; a += 17) {
      for (let b = -360; b <= 360; b += 23) {
        const d = angleDiffDeg(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(180);
        expect(d).toBeCloseTo(angleDiffDeg(b, a), 10);
      }
    }
  });

  it('measures a real cross-shaft displacement, not the along-shaft one', () => {
    // A 400 px shaft pointing right. Sliding the hosel 40 px ALONG the shaft changes
    // nothing; moving it 40 px ACROSS costs ~5.7°. This asymmetry is the whole reason
    // section 6 exists rather than the pixel medians being the headline.
    const butt = { x: 0, y: 0 };
    const base = shaftAngleDeg(butt, { x: 400, y: 0 });
    expect(angleDiffDeg(base, shaftAngleDeg(butt, { x: 440, y: 0 }))).toBeCloseTo(0, 12);
    expect(angleDiffDeg(base, shaftAngleDeg(butt, { x: 400, y: 40 }))).toBeCloseTo(5.7106, 3);
  });
});

describe('frameIdFromFileName', () => {
  it('strips the frames/ prefix and the extension', () => {
    expect(frameIdFromFileName('frames/dtl-range-3f2a91c4_s00_f03.jpg')).toBe('dtl-range-3f2a91c4_s00_f03');
    expect(frameIdFromFileName('frames\\a_s01_f02.JPEG')).toBe('a_s01_f02');
    expect(frameIdFromFileName('a_s01_f02')).toBe('a_s01_f02');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A COCO Keypoints export shaped like CVAT's. Height is 100 so a normalised distance
 * reads straight off the pixel value: 5 px = 5 % of height.
 *
 * @param {Array<{id: string, butt: number[], hosel: number[], attrs?: object}>} frames
 *        each point is `[x, y, v]`.
 */
function makeExport(frames, { height = 100, width = 100 } = {}) {
  return {
    categories: [{ id: 1, name: 'shaft', keypoints: [...POINTS], skeleton: [[1, 2]] }],
    images: frames.map((f, i) => ({ id: i + 1, width, height, file_name: `frames/${f.id}.jpg` })),
    annotations: frames.map((f, i) => ({
      id: i + 1,
      image_id: i + 1,
      category_id: 1,
      keypoints: [...f.butt, ...f.hosel],
      num_keypoints: [f.butt[2], f.hosel[2]].filter((v) => v > 0).length,
      attributes: { view: 'dtl', blur: 'none', phase: 'address', no_shaft: false, ...f.attrs },
    })),
  };
}

describe('parseCoco', () => {
  it('keys frames by frame id, not by COCO image_id', () => {
    // Same frame, different per-task image numbering — the join must still land.
    const a = parseCoco(makeExport([{ id: 'x_s00_f00', butt: [0, 0, 2], hosel: [0, 10, 2] }]), 'a');
    const shifted = makeExport([{ id: 'x_s00_f00', butt: [0, 0, 2], hosel: [0, 10, 2] }]);
    shifted.images[0].id = 4711;
    shifted.annotations[0].image_id = 4711;
    const b = parseCoco(shifted, 'b');
    expect([...a.frames.keys()]).toEqual([...b.frames.keys()]);
  });

  it('rejects an export whose keypoint order is not [butt, hosel]', () => {
    const swapped = makeExport([{ id: 'x_s00_f00', butt: [0, 0, 2], hosel: [0, 10, 2] }]);
    swapped.categories[0].keypoints = ['hosel', 'butt'];
    expect(() => parseCoco(swapped, 'a')).toThrow(/keypoint order/);
  });

  it('reports images that carry no annotation at all', () => {
    const e = makeExport([
      { id: 'x_s00_f00', butt: [0, 0, 2], hosel: [0, 10, 2] },
      { id: 'x_s00_f01', butt: [0, 0, 2], hosel: [0, 10, 2] },
    ]);
    e.annotations.pop();
    const parsed = parseCoco(e, 'a');
    expect(parsed.frames.size).toBe(1);
    expect(parsed.unannotated).toEqual(['x_s00_f01']);
  });
});

describe('verifyVisibility', () => {
  const notesFor = (frames) => verifyVisibility(parseCoco(makeExport(frames), 'a'));
  const levels = (notes, match) => notes.filter((n) => match.test(n.text)).map((n) => n.level);

  it('passes a file that uses 0/1/2 consistently with num_keypoints', () => {
    const notes = notesFor([
      { id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 40, 1] },
      { id: 'a_s00_f01', butt: [0, 0, 0], hosel: [10, 40, 2] },
    ]);
    expect(notes.every((n) => n.level === 'ok')).toBe(true);
  });

  it('fails on a visibility value outside {0,1,2}', () => {
    const e = makeExport([{ id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 40, 2] }]);
    e.annotations[0].keypoints[5] = 3;
    const notes = verifyVisibility(parseCoco(e, 'a'));
    expect(levels(notes, /utanför \{0,1,2\}/)).toEqual(['fail']);
  });

  it('fails when num_keypoints disagrees with the count of v>0 — the mapping witness', () => {
    const e = makeExport([{ id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 40, 1] }]);
    e.annotations[0].num_keypoints = 1; // exporter did not treat the occluded point as placed
    const notes = verifyVisibility(parseCoco(e, 'a'));
    expect(levels(notes, /num_keypoints/)).toEqual(['fail']);
  });

  it('warns when no v=1 occurs at all — occluded→1 is then unconfirmed, not confirmed', () => {
    const notes = notesFor([{ id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 40, 2] }]);
    expect(levels(notes, /occluded→1 är OBEKRÄFTAD/)).toEqual(['warn']);
  });

  it('warns about v=0 points that still carry coordinates', () => {
    const notes = notesFor([{ id: 'a_s00_f00', butt: [55, 66, 0], hosel: [10, 40, 1] }]);
    expect(levels(notes, /v=0 bär ändå koordinater/)).toEqual(['warn']);
  });

  it('warns when no_shaft=true but a point was placed anyway', () => {
    const notes = notesFor([{ id: 'a_s00_f00', butt: [10, 10, 1], hosel: [0, 0, 0], attrs: { no_shaft: true } }]);
    expect(levels(notes, /no_shaft=true/)).toEqual(['warn']);
  });
});

describe('compare', () => {
  it('splits coverage into shared and one-sided frames', () => {
    const A = parseCoco(makeExport([
      { id: 'a_s00_f00', butt: [0, 0, 2], hosel: [0, 40, 2] },
      { id: 'a_s00_f01', butt: [0, 0, 2], hosel: [0, 40, 2] },
    ]), 'A');
    const B = parseCoco(makeExport([
      { id: 'a_s00_f00', butt: [0, 0, 2], hosel: [0, 40, 2] },
      { id: 'a_s00_f02', butt: [0, 0, 2], hosel: [0, 40, 2] },
    ]), 'B');
    const r = compare(A, B);
    expect(r.coverage.inBoth).toBe(1);
    expect(r.coverage.onlyA).toEqual(['a_s00_f01']);
    expect(r.coverage.onlyB).toEqual(['a_s00_f02']);
  });

  it('compares only points BOTH annotators placed, using the flag and never the coordinate', () => {
    // The hosel carries a stale (0,0)≠ coordinate on B's side but is flagged outside, so
    // it must not contribute a 50 px "disagreement".
    const A = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 60, 2] }]), 'A');
    const B = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [13, 14, 2], hosel: [99, 99, 0] }]), 'B');
    const r = compare(A, B);
    expect(r.distances.butt.px.n).toBe(1);
    expect(r.distances.butt.px.median).toBeCloseTo(5, 12);
    expect(r.distances.butt.norm.median).toBeCloseTo(0.05, 12); // height 100
    expect(r.distances.hosel.px.n).toBe(0);
    expect(r.pointCoverage.hosel).toEqual({ both: 0, onlyA: 1, onlyB: 0, neither: 0 });
    // No shaft on B's side → no length and no angle for this frame.
    expect(r.length.n).toBe(0);
    expect(r.angle.n).toBe(0);
  });

  it('counts an occluded point as placed — v=1 is a position, v=0 is not', () => {
    const A = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [10, 10, 1], hosel: [10, 60, 2] }]), 'A');
    const B = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [10, 14, 2], hosel: [10, 60, 2] }]), 'B');
    const r = compare(A, B);
    expect(r.distances.butt.px.n).toBe(1);
    expect(r.distances.butt.px.median).toBeCloseTo(4, 12);
    expect(r.flags.butt.agreed).toBe(0); // occluded vs visible is still a flag disagreement
    expect(r.flags.butt.matrix[1][2]).toBe(1);
  });

  it('builds the 3×3 flag cross-table per point', () => {
    const frames = [
      ['a_s00_f00', 2, 2],
      ['a_s00_f01', 0, 1],
      ['a_s00_f02', 1, 1],
      ['a_s00_f03', 2, 0],
    ];
    const A = parseCoco(makeExport(frames.map(([id, v]) => ({ id, butt: [10, 10, v], hosel: [10, 60, 2] }))), 'A');
    const B = parseCoco(makeExport(frames.map(([id, , v]) => ({ id, butt: [10, 10, v], hosel: [10, 60, 2] }))), 'B');
    const m = compare(A, B).flags.butt;
    expect(m.total).toBe(4);
    expect(m.agreed).toBe(2); // f00 visible/visible, f02 occluded/occluded
    expect(m.matrix[2][2]).toBe(1);
    expect(m.matrix[0][1]).toBe(1);
    expect(m.matrix[1][1]).toBe(1);
    expect(m.matrix[2][0]).toBe(1);
  });

  it('measures shaft length per annotator and ranks the worst mismatch first', () => {
    // f00: both read a 40 px shaft. f01: B stopped the shaft at the hands — 20 px short.
    const A = parseCoco(makeExport([
      { id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 50, 2] },
      { id: 'a_s00_f01', butt: [10, 10, 2], hosel: [10, 50, 2] },
    ]), 'A');
    const B = parseCoco(makeExport([
      { id: 'a_s00_f00', butt: [10, 11, 2], hosel: [10, 51, 2] },
      { id: 'a_s00_f01', butt: [10, 30, 2], hosel: [10, 50, 2] },
    ]), 'B');
    const r = compare(A, B);
    expect(r.worstLength[0].id).toBe('a_s00_f01');
    expect(r.worstLength[0].length.a).toBeCloseTo(40, 12);
    expect(r.worstLength[0].length.b).toBeCloseTo(20, 12);
    expect(r.worstLength[0].length.diffPx).toBeCloseTo(20, 12);
    expect(r.worstLength[0].length.diffNorm).toBeCloseTo(0.2, 12);
    expect(r.worstLength[0].length.diffRatio).toBeCloseTo(1, 12); // vs the SHORTER length
    expect(r.worstLength[1].length.diffPx).toBeCloseTo(0, 12);
  });

  it('reports the angle difference per frame and summarises it', () => {
    // A: straight down. B: rotated 45° at the same butt.
    const A = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [0, 0, 2], hosel: [0, 40, 2] }]), 'A');
    const B = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [0, 0, 2], hosel: [40, 40, 2] }]), 'B');
    const r = compare(A, B);
    expect(r.angle.n).toBe(1);
    expect(r.angle.median).toBeCloseTo(45, 10);
  });

  it('buckets an attribute only where both annotators gave the same value', () => {
    const spec = [
      ['a_s00_f00', 'downswing', 'downswing'],
      ['a_s00_f01', 'downswing', 'top'],
      ['a_s00_f02', 'top', 'top'],
    ];
    const A = parseCoco(makeExport(spec.map(([id, phase]) => ({ id, butt: [10, 10, 2], hosel: [10, 50, 2], attrs: { phase } }))), 'A');
    const B = parseCoco(makeExport(spec.map(([id, , phase]) => ({ id, butt: [10, 10, 2], hosel: [10, 50, 2], attrs: { phase } }))), 'B');
    const info = compare(A, B).byAttribute.phase;
    expect(info.agreedCount).toBe(2);
    expect(info.disagreed).toEqual([{ id: 'a_s00_f01', a: 'downswing', b: 'top' }]);
    expect(info.buckets.map((b) => [b.value, b.n])).toEqual([['top', 1], ['downswing', 1]]);
  });

  it('ranks the review list on the worse of the two endpoints, normalised to image height', () => {
    // f01 has the larger deviation in pixels but sits in a much taller frame; f00 is the
    // worse label. Ranking on raw px would invert these two.
    const A = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [10, 10, 2], hosel: [10, 50, 2] }], { height: 100 }), 'A');
    const B = parseCoco(makeExport([{ id: 'a_s00_f00', butt: [10, 20, 2], hosel: [10, 50, 2] }], { height: 100 }), 'B');
    const A2 = parseCoco(makeExport([{ id: 'b_s00_f01', butt: [10, 10, 2], hosel: [10, 50, 2] }], { height: 1000 }), 'A2');
    const B2 = parseCoco(makeExport([{ id: 'b_s00_f01', butt: [10, 30, 2], hosel: [10, 50, 2] }], { height: 1000 }), 'B2');
    for (const [id, f] of A2.frames) A.frames.set(id, f);
    for (const [id, f] of B2.frames) B.frames.set(id, f);

    const r = compare(A, B);
    expect(r.worstOverall.map((x) => x.id)).toEqual(['a_s00_f00', 'b_s00_f01']);
    expect(r.worstOverall[0].worstNorm).toBeCloseTo(0.1, 12); // 10 px of 100
    expect(r.worstOverall[1].worstNorm).toBeCloseTo(0.02, 12); // 20 px of 1000
  });

  it('names a frame that is top-N on angle without being top-N on point deviation', () => {
    // 15 frames where B slid BOTH points 6–20 px along the shaft axis: large point
    // deviation, zero angle error, and worthless to re-open. Plus one where B pivoted the
    // shaft about its midpoint by 4 px per end: the smallest point deviation in the set
    // and the only angle error in it. The point ranking fills up on the first fifteen, so
    // the frame that actually costs a rule only appears if `angleOnly` catches it.
    const slid = [];
    for (let i = 0; i < 15; i++) {
      const shift = 20 - i;
      slid.push({
        id: `slide_s00_f${String(i).padStart(2, '0')}`,
        a: { butt: [50, 10, 2], hosel: [50, 90, 2] },
        b: { butt: [50, 10 + shift, 2], hosel: [50, 90 + shift, 2] },
      });
    }
    const pivot = {
      id: 'pivot_s00_f00',
      a: { butt: [50, 10, 2], hosel: [50, 90, 2] },
      b: { butt: [46, 10, 2], hosel: [54, 90, 2] },
    };
    const all = [...slid, pivot];
    const A = parseCoco(makeExport(all.map((f) => ({ id: f.id, ...f.a }))), 'A');
    const B = parseCoco(makeExport(all.map((f) => ({ id: f.id, ...f.b }))), 'B');

    const r = compare(A, B);
    expect(r.worstOverall).toHaveLength(15);
    expect(r.worstOverall.map((x) => x.id)).not.toContain('pivot_s00_f00');
    expect(r.worstOverall.every((x) => x.angle.diff === 0)).toBe(true);
    expect(r.angleOnly.map((x) => x.id)).toEqual(['pivot_s00_f00']);
    expect(r.angleOnly[0].angle.diff).toBeCloseTo(5.7106, 3);
  });
});
