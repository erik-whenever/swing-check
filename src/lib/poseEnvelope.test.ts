// Unit tests for detectSwingEnvelope (Ström D, pass 3 — envelope inversion).
//
// Pure-function tests over SYNTHETIC wrist trajectories: we drive the primary
// wrist (landmarks 15/16) along a hand-built y-path (MediaPipe normalized coords,
// y grows DOWNWARD → "wrists up" = smaller y) and assert the envelope/impact reads.
// No MediaPipe, no video — the detector is pure (PoseSample[] in, envelope out).
//
// These lock in the behaviours the four start/impact follow-ups fixed (see ADR-002):
//   • start = speed onset backed up to stillness, NOT a wrist-Y departure (drift-proof)
//   • finish = settle after the downswing pass; clip-cutoff protection otherwise
//   • impact = nearest approach to address height within tolerance (face-on tolerant),
//     with no impact on clipped / drift-only / static clips.

import { describe, it, expect } from 'vitest';
import { detectSwingEnvelope } from './poseEnvelope';
import type { PoseSample } from './poseTrajectory';

const DT = 1 / 15; // ~15 fps, the pose sampling rate

/** Build PoseSample[] from a wrist-Y path; x held still unless `xs` given.
 *  Only wrists 15/16 are made visible (others unusable), so the read is unambiguous. */
function samplesFromY(ys: number[], xs?: number[]): PoseSample[] {
  return ys.map((y, i) => {
    const x = xs ? xs[i] : 0.5;
    const wrist = { x, y, z: 0, visibility: 0.9 };
    const landmarks = Array.from({ length: 17 }, (_, k) =>
      k === 15 || k === 16 ? wrist : { x: 0, y: 0, z: 0, visibility: 0 },
    );
    return { t: i * DT, landmarks };
  });
}

/** Linear ramp of `n` points from `a` to `b` inclusive. */
function ramp(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)));
}

const ADDRESS_Y = 0.8; // wrists low at address (large y)
const TOP_Y = 0.3; // wrists high at the top (small y)

describe('detectSwingEnvelope', () => {
  it('full swing: start at motion onset, finish after the downswing pass, impact found', () => {
    const ys = [
      ...Array(10).fill(ADDRESS_Y), // still address
      ...ramp(ADDRESS_Y, TOP_Y, 12), // backswing (up)
      ...ramp(TOP_Y, 0.92, 9), // downswing, crosses back through ADDRESS_Y
      ...ramp(0.92, 0.35, 8), // follow-through (up again)
      ...Array(10).fill(0.35), // held high finish (settle)
    ];
    const e = detectSwingEnvelope(samplesFromY(ys));

    expect(e.valid).toBe(true);
    expect(e.clippedTail).toBe(false);
    // start lands just after the address plateau, at the take-away — not at t=0.
    expect(e.startSec).toBeGreaterThan(8 * DT);
    expect(e.startSec).toBeLessThan(14 * DT);
    // impact is confident and correctly ordered top < impact < finish.
    expect(e.impact).not.toBeNull();
    expect(e.impact!.topSec).toBeLessThan(e.impact!.timeSec);
    expect(e.impact!.timeSec).toBeGreaterThan(e.startSec);
    expect(e.impact!.timeSec).toBeLessThan(e.finishSec);
  });

  it('clipped clip: clippedTail true and NO impact (even if the tail nears address)', () => {
    // Downswing stops mid-descent at 0.78 — within IMPACT_ADDRESS_TOL (0.05) of
    // address (0.02) — but never settles, so the tail is clipped. The clippedTail
    // guard must override the tolerance → no verified impact.
    const ys = [
      ...Array(10).fill(ADDRESS_Y),
      ...ramp(ADDRESS_Y, TOP_Y, 12),
      ...ramp(TOP_Y, 0.78, 9), // ends still descending, no settle
    ];
    const e = detectSwingEnvelope(samplesFromY(ys));

    expect(e.valid).toBe(true);
    expect(e.clippedTail).toBe(true);
    expect(e.impact).toBeNull(); // drives impactClusterApplied = false downstream
  });

  it('long drifting address: start does NOT fire on the wrist-Y drift', () => {
    // 20 address frames whose wrist-Y DRIFTS 0.80 → 0.83 (0.03, > any sane position
    // tolerance) but stays slow, then a real take-away. A position-vs-plateau start
    // would trip on the drift; the speed-based start must land at the take-away.
    const driftFrames = 20;
    const ys = [
      ...ramp(ADDRESS_Y, 0.83, driftFrames), // slow drift during address
      ...ramp(0.83, TOP_Y, 12), // take-away + backswing
      ...ramp(TOP_Y, 0.92, 9),
      ...ramp(0.92, 0.35, 8),
      ...Array(10).fill(0.35),
    ];
    const e = detectSwingEnvelope(samplesFromY(ys));

    expect(e.valid).toBe(true);
    // The drift spans [0, ~1.27s]; start must be at/after the take-away, never inside it.
    expect(e.startSec).toBeGreaterThan((driftFrames - 2) * DT);
    expect(e.impact).not.toBeNull();
  });

  it('face-on-like path: impact via nearest-approach even without an exact addressY crossing', () => {
    // Downswing returns only to 0.77 — never reaches ADDRESS_Y (0.80), so a strict
    // crossing would miss — but nearest approach is 0.03, within IMPACT_ADDRESS_TOL.
    const ys = [
      ...Array(10).fill(ADDRESS_Y),
      ...ramp(ADDRESS_Y, TOP_Y, 12),
      ...ramp(TOP_Y, 0.77, 9), // nearest approach 0.03, NO crossing
      ...ramp(0.77, 0.35, 8),
      ...Array(10).fill(0.35),
    ];
    const e = detectSwingEnvelope(samplesFromY(ys));

    expect(e.valid).toBe(true);
    expect(e.clippedTail).toBe(false);
    expect(e.impact).not.toBeNull();
    expect(e.impact!.timeSec).toBeGreaterThan(e.impact!.topSec);
  });

  it('static clip (no motion): degrades to invalid, never throws', () => {
    const e = detectSwingEnvelope(samplesFromY(Array(30).fill(ADDRESS_Y)));
    expect(e.valid).toBe(false);
    expect(e.impact).toBeNull();
  });

  it('backswing only (no downswing/finish): no crash, no impact, degrades gracefully', () => {
    const ys = [
      ...Array(10).fill(ADDRESS_Y),
      ...ramp(ADDRESS_Y, TOP_Y, 15), // up to the top…
      ...Array(6).fill(TOP_Y), // …and held there; no return
    ];
    const e = detectSwingEnvelope(samplesFromY(ys));

    // Either a clipped-tail envelope or a plain invalid read is acceptable; the
    // contract is: no throw and no fabricated impact.
    expect(e.impact).toBeNull();
    if (e.valid) expect(e.clippedTail).toBe(true);
  });

  it('too few samples: invalid, does not throw', () => {
    const e = detectSwingEnvelope(samplesFromY(Array(4).fill(ADDRESS_Y)));
    expect(e.valid).toBe(false);
  });
});
