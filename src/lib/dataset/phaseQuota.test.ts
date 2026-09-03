// Unit tests for the annotation-budget cull (phaseQuota.ts).
//
// The rule under test is "keep the 7 frames whose phase mix sits closest to the spec's
// target weights", so what is asserted is the MIX and the degradation behaviour, not
// which particular timestamps survive.
//
// The last describe block covers the part that only exists ACROSS swings: the running
// deficit. Its point is that a phase too light to earn a frame in any single swing
// (`finish`, 6 % of 7 = 0.42) still gets its share of the export, so those assertions
// are about a 10-swing run rather than about one cull.

import { describe, it, expect } from 'vitest';
import {
  MAX_FRAMES_PER_SWING,
  PHASE_TARGET_WEIGHTS,
  createPhaseQuotaState,
  cullToPhaseTargets,
  tallyPhases,
  targetCounts,
  type PhaseQuotaState,
  type PhasedPick,
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

/** Cull `swings` selections back to back, threading the state — what a run does. */
function runOf(swings: PhasedPick[][], max = MAX_FRAMES_PER_SWING) {
  let state: PhaseQuotaState = createPhaseQuotaState();
  const kept: PhasedPick[] = [];
  for (const swing of swings) {
    const result = cullToPhaseTargets(swing, max, state);
    kept.push(...result.kept);
    state = result.state;
  }
  return { kept, state };
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

describe('cullToPhaseTargets — one swing', () => {
  it('cuts a 32-frame selection to the budget', () => {
    expect(cullToPhaseTargets(selection()).kept).toHaveLength(MAX_FRAMES_PER_SWING);
  });

  it('hits the target distribution when every phase has frames to spare', () => {
    expect(tallyPhases(cullToPhaseTargets(selection()).kept)).toEqual(
      targetCounts(MAX_FRAMES_PER_SWING),
    );
  });

  it('returns picks in time order', () => {
    const times = cullToPhaseTargets(selection()).kept.map((k) => k.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('is deterministic — same input, same frames', () => {
    const input = selection();
    expect(cullToPhaseTargets(input)).toEqual(cullToPhaseTargets([...input].reverse()));
  });

  it('leaves a selection at or under the budget untouched', () => {
    const small = [...picks('downswing', 3, 0), ...picks('impact', 2, 1)];
    expect(cullToPhaseTargets(small).kept).toHaveLength(5);
  });

  it('never keeps more of a phase than exists', () => {
    // No downswing frames at all — its share must flow elsewhere, not be invented.
    const noDownswing = [
      ...picks('address', 5, 0),
      ...picks('backswing', 10, 1),
      ...picks('through', 10, 2),
    ];
    const tally = tallyPhases(cullToPhaseTargets(noDownswing).kept);
    expect(tally.downswing).toBe(0);
    expect(tally.impact).toBe(0);
    // Budget still filled from the phases that do have frames.
    expect(SHAFT_PHASES.reduce((a, p) => a + tally[p], 0)).toBe(MAX_FRAMES_PER_SWING);
  });

  it('gives the whole budget to one phase when that is all there is', () => {
    const tally = tallyPhases(cullToPhaseTargets(picks('backswing', 20)).kept);
    expect(tally.backswing).toBe(MAX_FRAMES_PER_SWING);
  });

  it('spreads the kept frames across each phase rather than clustering them', () => {
    // 20 downswing frames, nothing else: the 7 kept must span the whole window,
    // endpoints included — the extremes are where the shaft moves fastest.
    const kept = cullToPhaseTargets(picks('downswing', 20)).kept;
    expect(kept[0].t).toBeCloseTo(0, 10);
    expect(kept[kept.length - 1].t).toBeCloseTo(0.19, 10);
  });

  it('carries extra fields on the picks through untouched', () => {
    const tagged = picks('impact', 4).map((p, i) => ({ ...p, tag: `f${i}` }));
    for (const k of cullToPhaseTargets(tagged, 2).kept) expect(k.tag).toMatch(/^f\d$/);
  });

  it('returns nothing for a non-positive budget', () => {
    expect(cullToPhaseTargets(selection(), 0).kept).toEqual([]);
  });
});

describe('cullToPhaseTargets — deficit carried across swings', () => {
  it('gives finish frames over a run of 10 swings, which one swing never can', () => {
    // 6 % of a 7-frame budget is 0.42 frames, so a per-swing cull rounds finish to zero
    // every single time. That is the regression the running deficit exists to fix.
    expect(tallyPhases(cullToPhaseTargets(selection()).kept).finish).toBe(0);

    const tally = tallyPhases(runOf(Array.from({ length: 10 }, selection)).kept);
    expect(tally.finish).toBeGreaterThan(0);
  });

  it('lands within 3 percentage points of every target over 10 swings', () => {
    const { kept } = runOf(Array.from({ length: 10 }, selection));
    expect(kept).toHaveLength(10 * MAX_FRAMES_PER_SWING);

    const weightSum = SHAFT_PHASES.reduce((a, p) => a + PHASE_TARGET_WEIGHTS[p], 0);
    const tally = tallyPhases(kept);
    for (const phase of SHAFT_PHASES) {
      const actualPct = (tally[phase] / kept.length) * 100;
      const targetPct = (PHASE_TARGET_WEIGHTS[phase] / weightSum) * 100;
      expect(Math.abs(actualPct - targetPct)).toBeLessThanOrEqual(3);
    }
  });

  it('reaches every phase in the spec, none left empty', () => {
    const tally = tallyPhases(runOf(Array.from({ length: 10 }, selection)).kept);
    for (const phase of SHAFT_PHASES) expect(tally[phase]).toBeGreaterThan(0);
  });

  it('threads a state that accounts for exactly the frames kept', () => {
    const { kept, state } = runOf(Array.from({ length: 10 }, selection));
    expect(state.total).toBe(kept.length);
    expect(state.dealt).toEqual(tallyPhases(kept));
  });

  it('counts an under-budget swing too, so the next one does not over-correct', () => {
    // Three finish frames go straight through uncut; the run's deficit must see them.
    const { state } = cullToPhaseTargets(picks('finish', 3), MAX_FRAMES_PER_SWING);
    expect(state.total).toBe(3);
    expect(state.dealt.finish).toBe(3);
  });

  it('does not mutate the state it was given', () => {
    const state = createPhaseQuotaState();
    const before = JSON.stringify(state);
    cullToPhaseTargets(selection(), MAX_FRAMES_PER_SWING, state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('leaves a fresh state behaving exactly like a standalone cull', () => {
    const withFresh = cullToPhaseTargets(selection(), MAX_FRAMES_PER_SWING, createPhaseQuotaState());
    expect(withFresh.kept).toEqual(cullToPhaseTargets(selection()).kept);
  });
});
