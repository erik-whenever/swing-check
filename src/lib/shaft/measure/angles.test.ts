// The angle arithmetic. The tests that matter are the ones about WRAPPING and about the
// two angle spaces staying apart — those are where a plausible-looking bug hides a real
// endpoint swap.

import { describe, expect, it } from 'vitest';
import {
  angleDeg,
  angleDifference,
  circularMedianDeg,
  distance,
  lineOrientationDeg,
  median,
  percentile,
  principalAxisFit,
  signedAngleDifference,
} from './angles';

describe('angleDeg — directed, image convention (y downward)', () => {
  it('measures the from → to direction with atan2(dy, dx)', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(180);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(-90);
  });

  it('swapping the endpoints turns the angle by exactly half a circle', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 40, y: 90 };
    expect(angleDifference(angleDeg(a, b), angleDeg(b, a))).toBeCloseTo(180, 10);
  });
});

describe('angleDifference — wrapped to [0, 180], never folded at 90', () => {
  it('takes the short way round the seam', () => {
    expect(angleDifference(179, -179)).toBeCloseTo(2, 10);
    expect(angleDifference(-179, 179)).toBeCloseTo(2, 10);
  });

  it('reports a swapped pair as ~180 rather than absorbing it as 0', () => {
    // This is the whole reason the difference is not folded: folding at 90 would make
    // the measured 150–180° endpoint swap read as 0–30° of ordinary rotation.
    expect(angleDifference(30, 210)).toBeCloseTo(180, 10);
    expect(angleDifference(30, 200)).toBeCloseTo(170, 10);
  });
});

describe('signedAngleDifference — (-180, 180]', () => {
  it('keeps the sign of the short way round', () => {
    expect(signedAngleDifference(10, 350)).toBeCloseTo(20, 10);
    expect(signedAngleDifference(350, 10)).toBeCloseTo(-20, 10);
  });

  it('normalises an antipodal pair to +180, so both directions agree', () => {
    expect(signedAngleDifference(0, 180)).toBe(180);
    expect(signedAngleDifference(180, 0)).toBe(180);
  });
});

describe('lineOrientationDeg — undirected, (-90, 90], anticlockwise ON SCREEN', () => {
  it('flips the y axis so the number reads the way a human sees it', () => {
    // Up and to the right on screen is a smaller y, and reads as a positive tilt.
    expect(lineOrientationDeg({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45, 10);
    expect(lineOrientationDeg({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(-45, 10);
  });

  it('gives the same answer whichever end you start from', () => {
    const a = { x: 3, y: 17 };
    const b = { x: 29, y: 4 };
    expect(lineOrientationDeg(a, b)).toBeCloseTo(lineOrientationDeg(b, a)!, 10);
  });

  it('is null for a zero-length segment rather than 0', () => {
    // 0 would put a collapsed detection neatly on the horizontal.
    expect(lineOrientationDeg({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it('puts vertical at +90, not -90', () => {
    expect(lineOrientationDeg({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(90);
    expect(lineOrientationDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });
});

describe('percentile / median', () => {
  it('interpolates linearly, matching numpy and the Python evaluation', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7, 10);
    expect(median([5])).toBe(5);
  });

  it('is null on an empty sample — not 0, not NaN', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.9)).toBeNull();
  });

  it('does not reorder the caller\'s array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('circularMedianDeg', () => {
  it('does not invent an angle the club never had at the seam', () => {
    // A plain median of 179 and -179 is 0 — pointing the opposite way.
    expect(circularMedianDeg([179, -179])).toBe(179);
    expect(Math.abs(circularMedianDeg([179, -178, 180])!)).toBeGreaterThan(170);
  });

  it('lets an outlier lose rather than drag the answer', () => {
    expect(circularMedianDeg([10, 11, 12, 190])).toBe(11);
  });

  it('is null on an empty sample', () => {
    expect(circularMedianDeg([])).toBeNull();
  });
});

describe('principalAxisFit', () => {
  it('fits a vertical run, which ordinary least squares cannot', () => {
    const fit = principalAxisFit([
      { x: 5, y: 0 },
      { x: 5, y: 1 },
      { x: 5, y: 2 },
    ]);
    expect(fit!.tiltDeg).toBeCloseTo(90, 6);
    expect(fit!.rmsResidual).toBeCloseTo(0, 10);
  });

  it('reports how far from line-like the cloud actually was', () => {
    const straight = principalAxisFit([
      { x: 0, y: 0 },
      { x: 1, y: -1 },
      { x: 2, y: -2 },
    ]);
    expect(straight!.tiltDeg).toBeCloseTo(45, 6);
    expect(straight!.rmsResidual).toBeCloseTo(0, 10);

    const bent = principalAxisFit([
      { x: 0, y: 0 },
      { x: 1, y: -2 },
      { x: 2, y: -2 },
    ]);
    expect(bent!.rmsResidual).toBeGreaterThan(0.3);
  });

  it('is null for fewer than two points or a cloud with no spread', () => {
    expect(principalAxisFit([{ x: 1, y: 1 }])).toBeNull();
    expect(principalAxisFit([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('distance', () => {
  it('is the plain Euclidean one', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
