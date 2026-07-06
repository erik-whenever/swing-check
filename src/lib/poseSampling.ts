import type { PoseSample } from './poseTrajectory';

// Pure helper split out from the overlay component so the .tsx file only exports
// a component (keeps react-refresh happy). The `PoseSample` import is type-only
// and erased at build time, so this module carries no @mediapipe runtime weight.

/** The pose sample whose timestamp is closest to `timeSec` (undefined → none). */
export function nearestSample(
  samples: PoseSample[],
  timeSec: number | undefined,
): PoseSample | null {
  if (samples.length === 0 || timeSec === undefined) return null;
  let best: PoseSample | null = null;
  let bestDist = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.t - timeSec);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
