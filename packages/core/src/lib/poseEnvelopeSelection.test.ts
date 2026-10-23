// Unit tests for the frame selector (poseEnvelopeSelection.ts).
//
// Synthetic envelopes, not fixtures: the fixture harness
// (poseEnvelopeRegression.test.ts) pins what real clips produce end to end, which
// makes it the wrong place to assert selection RULES — a golden count cannot say
// whether the cluster landed on the top or on impact. These tests build envelopes
// with the boundaries spelled out so each rule can be checked on its own.

import { describe, it, expect } from 'vitest';
import { selectEnvelopeFrames } from './poseEnvelopeSelection';
import type { SwingEnvelope } from './poseEnvelope';

const BUDGET = 32;

/**
 * A typical envelope: 1.6 s long, confident impact, top 0.35 s before impact —
 * the shape of the DTL fixture, in round numbers.
 */
function envelope(overrides: Partial<SwingEnvelope> = {}): SwingEnvelope {
  return {
    valid: true,
    startSec: 6.8,
    finishSec: 8.4,
    clippedTail: false,
    impact: { topSec: 7.5, timeSec: 7.85, downswingSec: 0.35 },
    impactReason: 'confident impact',
    trackedWrist: 'right',
    visibleFrac: 1,
    sampleDt: 1 / 15,
    addressY: 0.42,
    apexY: 0.15,
    finishY: 0.16,
    peakSpeed: 1.0,
    ...overrides,
  } as SwingEnvelope;
}

/** Frames landing within `half` seconds of `centre`. */
function near(times: number[], centre: number, half: number): number[] {
  return times.filter((t) => Math.abs(t - centre) <= half);
}

describe('selectEnvelopeFrames — budget', () => {
  it('fills a typical envelope close to the 32-frame budget', () => {
    const env = envelope();
    const sel = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0);

    expect(sel.requested).toBe(BUDGET);
    expect(sel.usedEnvelope).toBe(true);
    // Dedupe (0.03 s) trims where the cluster overlaps the baseline. The number to
    // defend is not "exactly 32" but "clearly denser than the old 20 and no runaway
    // collapse" — the field log reports requested vs. delivered for exactly this.
    expect(sel.picks.length).toBeGreaterThan(20);
    expect(sel.picks.length).toBeLessThanOrEqual(BUDGET);
    // Endpoints: address and finish keep coverage no matter what clustering did.
    expect(sel.picks[0].t).toBeCloseTo(env.startSec, 6);
    expect(sel.picks[sel.picks.length - 1].t).toBeCloseTo(env.finishSec, 6);
    // Sorted, and never outside the envelope.
    for (let i = 1; i < sel.picks.length; i++) {
      expect(sel.picks[i].t).toBeGreaterThan(sel.picks[i - 1].t);
    }
  });

  it('never returns picks closer together than the dedupe distance', () => {
    // A short envelope cannot hold 32 distinct source frames; asking for them must
    // not make the count go DOWN (greedy dedupe used to do exactly that).
    const env = envelope({ startSec: 1.0, finishSec: 1.6, impact: null });
    const sel = selectEnvelopeFrames(env, BUDGET, 0.5, 2.0);

    expect(sel.picks.length).toBeLessThan(BUDGET);
    for (let i = 1; i < sel.picks.length; i++) {
      expect(sel.picks[i].t - sel.picks[i - 1].t).toBeGreaterThanOrEqual(0.03 - 1e-9);
    }
    // …and at least as many as the smaller budget would have produced.
    const smaller = selectEnvelopeFrames(env, 20, 0.5, 2.0);
    expect(sel.picks.length).toBeGreaterThanOrEqual(smaller.picks.length);
  });
});

describe('selectEnvelopeFrames — phase clustering', () => {
  it('splits the cluster budget across two rule phases and centres each one', () => {
    const env = envelope();
    // Two rules in different phases: one about the top, one about downswing
    // sequencing. The second is the case that returned cannot_determine in
    // production when everything clustered on impact.
    const sel = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['downswing', 'top'],
    });

    // Reported in swing order, not the order they were asked for.
    expect(sel.clusterPhases).toEqual(['top', 'downswing']);
    expect(sel.impactClusterApplied).toBe(true);
    // 0.4 × 32 ≈ 13, split evenly.
    const alloc = sel.clusterAllocation;
    expect((alloc.top ?? 0) + (alloc.downswing ?? 0)).toBe(13);
    expect(Math.abs((alloc.top ?? 0) - (alloc.downswing ?? 0))).toBeLessThanOrEqual(1);

    const times = sel.picks.map((p) => p.t);
    const topCentre = env.impact!.topSec;
    const downCentre = (env.impact!.topSec + env.impact!.timeSec) / 2;

    // Both centres are genuinely dense — several frames inside a 0.1 s window that
    // the uniform baseline alone (~0.09 s apart) could only put one or two in.
    expect(near(times, topCentre, 0.05).length).toBeGreaterThanOrEqual(3);
    expect(near(times, downCentre, 0.05).length).toBeGreaterThanOrEqual(3);
    // And impact, which no rule asked about, is NOT the dense place any more.
    expect(near(times, env.impact!.timeSec, 0.05).length).toBeLessThan(
      near(times, downCentre, 0.05).length,
    );
  });

  it('treats impact as an ordinary phase when a rule asks for it', () => {
    const env = envelope();
    const sel = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['address', 'impact'],
    });

    expect(sel.clusterPhases).toEqual(['address', 'impact']);
    expect(sel.clusterAllocation.impact).toBeGreaterThan(0);
    expect(sel.clusterAllocation.address).toBeGreaterThan(0);
    // Split, not monopolised: impact gets about half the cluster, not all of it.
    expect(sel.clusterAllocation.impact).toBeLessThan(13);
  });

  it('ignores duplicate phases from several rules looking at the same place', () => {
    const env = envelope();
    const many = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['downswing', 'downswing', 'downswing'],
    });
    const one = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['downswing'],
    });

    expect(many.clusterPhases).toEqual(['downswing']);
    expect(many.picks.map((p) => p.t)).toEqual(one.picks.map((p) => p.t));
  });

  it('drops interior phases that cannot be located without a confident impact', () => {
    // No impact ⇒ no top, so top/downswing/impact have no real centre. Guessing one
    // would spend 40 % of the budget on a time that may be nowhere near the phase.
    const env = envelope({ impact: null, impactReason: 'no impact' });
    const sel = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['top', 'downswing'],
    });

    expect(sel.clusterPhases).toEqual([]);
    expect(sel.impactClusterApplied).toBe(false);
    // Pure uniform baseline — identical to asking for no clustering at all.
    const baseline = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0);
    expect(sel.picks.map((p) => p.t)).toEqual(baseline.picks.map((p) => p.t));
  });
});

describe('selectEnvelopeFrames — fallback to the impact cluster', () => {
  it('clusters on impact when no phase information is supplied', () => {
    const env = envelope();
    const omitted = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0);
    const empty = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, { clusterPhases: [] });
    const explicit = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0, {
      clusterPhases: ['impact'],
    });

    // Missing and empty are the same thing: the pre-existing behaviour, untouched.
    expect(omitted.clusterPhases).toEqual(['impact']);
    expect(omitted.impactClusterApplied).toBe(true);
    expect(empty.picks.map((p) => p.t)).toEqual(omitted.picks.map((p) => p.t));
    // …and it is the same selection an explicit impact-only request produces.
    expect(explicit.picks.map((p) => p.t)).toEqual(omitted.picks.map((p) => p.t));

    // The whole cluster budget sits on impact.
    expect(omitted.clusterAllocation).toEqual({ impact: 13 });
    expect(
      near(omitted.picks.map((p) => p.t), env.impact!.timeSec, 0.1).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('keeps the uniform baseline when there is no confident impact', () => {
    const env = envelope({ impact: null, impactReason: 'no impact' });
    const sel = selectEnvelopeFrames(env, BUDGET, 6.0, 9.0);

    expect(sel.impactClusterApplied).toBe(false);
    expect(sel.clusterPhases).toEqual([]);
    expect(sel.usedEnvelope).toBe(true);
    expect(sel.picks[0].t).toBeCloseTo(env.startSec, 6);
    expect(sel.picks[sel.picks.length - 1].t).toBeCloseTo(env.finishSec, 6);
  });

  it('falls back to even-over-span when the envelope is not usable', () => {
    const env = envelope({ valid: false, reason: 'too few pose samples' });
    const sel = selectEnvelopeFrames(env, BUDGET, 2.0, 5.0, {
      clusterPhases: ['downswing'],
    });

    expect(sel.fellBackToEven).toBe(true);
    expect(sel.usedEnvelope).toBe(false);
    expect(sel.clusterPhases).toEqual([]);
    expect(sel.picks.length).toBe(BUDGET);
    expect(sel.reason).toBe('too few pose samples');
  });
});
