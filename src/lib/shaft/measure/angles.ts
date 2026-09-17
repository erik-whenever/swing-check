// Angle and summary arithmetic for the shaft measurements. Pure, wrap-correct, and
// deliberately the ONLY place any of it is written.
//
// TWO ANGLE SPACES, KEPT APART.
//
//   DIRECTED (`angleDeg`)   — the direction of an ordered vector, (-180, 180]. The
//                             shaft's `butt → hosel` and the blade's `heel → toe` are
//                             directed, because the keypoints are ordered. Swapped
//                             endpoints must therefore show up as ~180°, not be
//                             quietly absorbed as 0°. That absorption is exactly the
//                             failure this layer has to detect.
//
//   ORIENTATION (`lineOrientationDeg`) — the tilt of an UNDIRECTED line, (-90, 90],
//                             measured from the image horizontal with positive = anti-
//                             clockwise on screen. Used only where the question really
//                             is about a line and not an arrow ("how far from
//                             horizontal is the shaft at the top"), and never as an
//                             input to flip detection.
//
// Mixing them is the one mistake that makes an endpoint swap invisible, so the two
// have different names, different ranges and different return types, and nothing here
// converts silently between them.
//
// `angleDeg` and `angleDifference` match `angle_deg` / `angle_difference` in
// `training/evaluate.py` value for value — the browser and the Python evaluation must
// not disagree about what a shaft angle is.

import type { Point2D } from './shaftSeries';

/**
 * Direction of the `from → to` vector, degrees, `atan2(dy, dx)` in IMAGE coordinates
 * (y downward), range (-180, 180].
 *
 * Because y grows downward, a positive angle points down-right on screen. That is
 * inconvenient to read and completely irrelevant to correctness — what matters is that
 * one convention is used everywhere, and this is it. Anything that needs a
 * human-readable tilt uses `lineOrientationDeg`.
 */
export function angleDeg(from: Point2D, to: Point2D): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

/**
 * Absolute difference between two directed angles, wrapped to [0, 180].
 *
 * Deliberately NOT folded at 90°: both vectors are directed, so swapped endpoints must
 * surface as ~180° rather than as ~0°. Folding here is what would hide the flip.
 *
 * NOT A LITERAL PORT OF THE PYTHON. `angle_difference` in `training/evaluate.py` is
 * `abs((a - b + 180) % 360 - 180)`, which is correct in Python because `%` there is a
 * modulo. JavaScript's `%` is a REMAINDER and keeps the left operand's sign, so the
 * same expression returns 358 where it should return 2 whenever `a - b + 180` is
 * negative — i.e. exactly at the seam this function exists to handle. The double
 * modulo below is the fix; the two implementations agree value for value.
 */
export function angleDifference(a: number, b: number): number {
  return Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180);
}

/**
 * Signed difference `a - b`, wrapped to (-180, 180]. Positive means `a` is
 * anticlockwise of `b` in the directed space above.
 */
export function signedAngleDifference(a: number, b: number): number {
  const d = ((a - b + 180) % 360 + 360) % 360 - 180;
  // The modulo above lands exactly -180 for an antipodal pair; normalise to +180 so the
  // range is (-180, 180] and the two directions of a straight reversal agree in sign.
  return d === -180 ? 180 : d;
}

/**
 * Tilt of the UNDIRECTED line through `a` and `b`, degrees from the image horizontal,
 * range (-90, 90], positive = anticlockwise ON SCREEN (the y-flip is applied here).
 *
 * Null when the two points coincide: a zero-length segment has no orientation, and
 * returning 0 for it would put a degenerate detection on the horizontal.
 */
export function lineOrientationDeg(a: Point2D, b: Point2D): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  // -dy: screen y grows downward, and this function's whole purpose is to be read by a
  // human as "tilted up" or "tilted down".
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  // Fold the two directions of the same line together into (-90, 90].
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  return deg;
}

/** Euclidean distance. */
export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Linear-interpolated percentile, matching numpy's default `linear` method — the same
 * construction as `percentile` in `training/evaluate.py` and
 * `scripts/measure-calibration.mjs`, so every number in this project is computed the
 * same way and the browser's numbers are comparable with the humans'.
 *
 * Null for an empty input rather than `NaN` or 0: "no measurements" is a fact worth
 * carrying, and both of the alternatives look like values.
 */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((x, y) => x - y);
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return ordered[low];
  return ordered[low] + (ordered[high] - ordered[low]) * (position - low);
}

/** Median, on the same construction as `percentile`. */
export function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

/**
 * Circular median of DIRECTED angles: the member of `values` whose total wrapped
 * distance to every other member is smallest (the medoid under `angleDifference`).
 *
 * An arithmetic mean or a plain median is wrong on a wrapped quantity — the median of
 * 179° and -179°, two angles 2° apart, is 0°, pointing the opposite way. The medoid
 * cannot produce a value the club never had, which also makes it the right answer for
 * a small sample that contains a flipped frame: the flip is an outlier and loses.
 *
 * O(n²), and n is the ~20 frames of one swing. Null for an empty input.
 */
export function circularMedianDeg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  let best = values[0];
  let bestCost = Infinity;
  for (const candidate of values) {
    let cost = 0;
    for (const other of values) cost += angleDifference(candidate, other);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

/**
 * Total-least-squares (principal axis) fit through a point cloud.
 *
 * Ordinary least squares would fit `y` as a function of `x` and blow up on a near
 * vertical run of clubhead positions, which is most of a downswing. The principal axis
 * has no preferred axis and handles vertical as easily as horizontal.
 *
 * Returns the axis tilt in `lineOrientationDeg`'s space — degrees from the image
 * horizontal, (-90, 90], positive = anticlockwise on screen — plus the RMS
 * perpendicular distance from the points to that axis, in the input's own units, as
 * the honest measure of how line-like the cloud actually was. Null for fewer than two
 * points or for a cloud with no spread.
 */
export function principalAxisFit(
  points: readonly Point2D[],
): { tiltDeg: number; rmsResidual: number } | null {
  if (points.length < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / points.length;
  const cy = sy / points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 && syy === 0) return null;

  // Principal axis direction of the 2×2 scatter matrix. The doubled angle is the
  // standard closed form; halving it gives the axis, already folded into (-90, 90].
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  let sumSq = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    // Perpendicular component of (dx, dy) against the unit axis (ux, uy).
    const perp = dx * uy - dy * ux;
    sumSq += perp * perp;
  }

  const tilt = lineOrientationDeg({ x: cx, y: cy }, { x: cx + ux, y: cy + uy });
  if (tilt === null) return null;
  return { tiltDeg: tilt, rmsResidual: Math.sqrt(sumSq / points.length) };
}
