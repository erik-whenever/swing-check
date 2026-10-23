// Small numeric helpers for the measuring view. Spike-local on purpose: nothing here is
// domain logic worth sharing through @swingcheck/core.

export interface Spread {
  n: number;
  median: number;
  p95: number;
  max: number;
}

export function spread(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  return { n: s.length, median: at(0.5), p95: at(0.95), max: s[s.length - 1] };
}

/**
 * Frames the camera never delivered, read off the gaps between delivered timestamps.
 * A gap of k intervals means k - 1 frames were dropped (late frames are discarded while a
 * frame processor is still busy, so they show up exactly as gaps).
 */
export function droppedFrames(timestampsMs: number[], fps: number): number {
  const interval = 1000 / fps;
  let dropped = 0;
  for (let i = 1; i < timestampsMs.length; i++) {
    const gap = timestampsMs[i] - timestampsMs[i - 1];
    if (gap > 1.5 * interval) dropped += Math.round(gap / interval) - 1;
  }
  return dropped;
}

export const THERMAL_RANK: Record<string, number> = {
  unknown: -1,
  nominal: 0,
  fair: 1,
  serious: 2,
  critical: 3,
};

export const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
