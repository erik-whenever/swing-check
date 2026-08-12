// Unit tests for the annotation-budget cull (phaseQuota.ts).
//
// The rule under test is "keep the 7 frames whose phase mix sits closest to the spec's
// target weights", so what is asserted is the MIX and the degradation behaviour, not
// which particular timestamps survive.

import { describe, it, expect } from 'vitest';
import {
  MAX_FRAMES_PER_SWING,
  PHASE_TARGET_WEIGHTS,
  cullToPhaseTargets,
  tallyPhases,
  targetCounts,
} from './phaseQuota';
import { SHAFT_PHASES, type ShaftPhase } from './datasetTypes';

/** `n` picks of one phase, at t = base, base+0.01, … */
function picks(phase: ShaftPhase, n: number, base = 0): { t: number; phase: ShaftPhase }[] {
  return Array.from({ length: n }, (_, i) => ({ t: base + i * 0.01, phase }));
}

/** A realistic 32-frame selection: the phase mix an envelope-with-impact produces. */
function selection() {
  return [
    ...picks('address', 2, 0),
    ...picks('backswing', 10, 1),
    ...picks('top', 2, 2),
    ...picks('downswing', 6, 3),
    ...picks('impact', 2, 4),
    ...picks('through', 7, 5),
    ...picks('finish', 3, 6),
  ];
}

describe('PHASE_TARGET_WEIGHTS', () => {
  it('sums to 1 and is heaviest on the downswing', () => {
    const sum = SHAFT_PHASES.reduce((acc, p) => acc + PHASE_TARGET_WEIGHTS[p], 0);
    expect(sum).toBeCloseTo(1, 10);
    for (const p of SHAFT_PHASES) {
      if (p === 'downswing') continue;
      expect(PHASE_TARGET_WEIGHTS.downswing).toBeGreaterThan(PHASE_TARGET_WEIGHTS[p]);
    }
  });

  it('covers every phase in the spec', () => {
    expect(Object.keys(PHASE_TARGET_WEIGHTS).sort()).toEqual([...SHAFT_PHASES].sort());
  });
});

describe('targetCounts', () => {
  it('distributes the budget with the downswing heaviest', () => {
    expect(targetCounts(MAX_FRAMES_PER_SWING)).toEqual({
      address: 1,
      backswing: 1,
      top: 1,
      downswing: 2,
      impact: 1,
      through: 1,
      finish: 0,
    });
  });

  it('always allocates exactly the budget', () => {
    for (const n of [1, 3, 7, 20, 32]) {
      const counts = targetCounts(n);
      expect(SHAFT_PHASES.reduce((a, p) => a + counts[p], 0)).toBe(n);
    }
  });
});

describe('cullToPhaseTargets', () => {
  it('cuts a 32-frame selection to the budget', () => {
    const kept = cullToPhaseTargets(selection());
    expect(kept).toHaveLength(MAX_FRAMES_PER_SWING);
  });

  it('hits the target distribution when every phase has frames to spare', () => {
    expect(tallyPhases(cullToPhaseTargets(selection()))).toEqual(targetCounts(MAX_FRAMES_PER_SWING));
  });

  it('returns picks in time order', () => {
    const kept = cullToPhaseTargets(selection());
    const times = kept.map((k) => k.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('is deterministic — same input, same frames', () => {
    const input = selection();
    expect(cullToPhaseTargets(input)).toEqual(cullToPhaseTargets([...input].reverse()));
  });

  it('leaves a selection at or under the budget untouched', () => {
    const small = [...picks('downswing', 3, 0), ...picks('impact', 2, 1)];
    expect(cullToPhaseTargets(small)).toHaveLength(5);
  });

  it('never keeps more of a phase than exists', () => {
    // No downswing frames at all — its share must flow elsewhere, not be invented.
    const noDownswing = [
      ...picks('address', 5, 0),
      ...picks('backswing', 10, 1),
      ...picks('through', 10, 2),
    ];
    const tally = tallyPhases(cullToPhaseTargets(noDownswing));
    expect(tally.downswing).toBe(0);
    expect(tally.impact).toBe(0);
    // Budget still filled from the phases that do have frames.
    expect(SHAFT_PHASES.reduce((a, p) => a + tally[p], 0)).toBe(MAX_FRAMES_PER_SWING);
  });

  it('gives the whole budget to one phase when that is all there is', () => {
    const tally = tallyPhases(cullToPhaseTargets(picks('backswing', 20)));
    expect(tally.backswing).toBe(MAX_FRAMES_PER_SWING);
  });

  it('spreads the kept frames across each phase rather than clustering them', () => {
    // 20 downswing frames, nothing else: the 7 kept must span the whole window,
    // endpoints included — the extremes are where the shaft moves fastest.
    const kept = cullToPhaseTargets(picks('downswing', 20));
    expect(kept[0].t).toBeCloseTo(0, 10);
    expect(kept[kept.length - 1].t).toBeCloseTo(0.19, 10);
  });

  it('carries extra fields on the picks through untouched', () => {
    const tagged = picks('impact', 4).map((p, i) => ({ ...p, tag: `f${i}` }));
    for (const k of cullToPhaseTargets(tagged, 2)) expect(k.tag).toMatch(/^f\d$/);
  });

  it('returns nothing for a non-positive budget', () => {
    expect(cullToPhaseTargets(selection(), 0)).toEqual([]);
  });
});
