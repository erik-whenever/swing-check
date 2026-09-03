// Unit tests for the dataset extractor's own acceptance gate (datasetGate.ts).
//
// Two jobs here. The first half asserts the LOOSENING — that the cases production
// throws away (clipped tail, a 6 s slow-motion envelope, no confident impact) come back
// as training data, and that the two floors that must survive (ball pickup, gesture)
// still reject.
//
// The second half is a DRIFT GUARD. Three of production's thresholds are mirrored as
// constants in datasetGate.ts because Ström S may not edit poseSegments.ts, not even to
// export them. Each mirror is pinned against the real `isSwing` by feeding it envelopes
// either side of the mirrored value: move a threshold in production and these fail,
// instead of the dev gate quietly using a stale number.

import { describe, it, expect } from 'vitest';
import {
  DATASET_MAX_ENVELOPE_SEC,
  DATASET_MIN_ENVELOPE_SEC,
  MIN_PEAK_SPEED_FRAC,
  MIN_VERTICAL_EXCURSION,
  MULTI_SWING_SUSPECT_SEC,
  collectDatasetSwings,
  gateCounts,
  isSuspectMultiSwing,
  passesDatasetGate,
} from './datasetGate';
import type { SwingEnvelope } from '../poseEnvelope';
import { isSwing, type SessionSwings, type SwingCandidate } from '../poseSegments';

/** Session refSpeed used throughout — 1.0 makes the peak-speed fraction read directly. */
const REF_SPEED = 1;

/**
 * A structurally sound envelope that BOTH gates accept, so each test can move exactly
 * one property and attribute the verdict to it. Address at y = 0.5, apex 0.2 above it.
 */
function envelope(over: Partial<SwingEnvelope> = {}): SwingEnvelope {
  return {
    valid: true,
    startSec: 1,
    finishSec: 2.5,
    clippedTail: false,
    impact: null,
    impactReason: 'test fixture',
    trackedWrist: 'left',
    visibleFrac: 0.9,
    sampleDt: 1 / 30,
    addressY: 0.5,
    apexY: 0.3,
    finishY: 0.4,
    peakSpeed: 1,
    ...over,
  };
}

/** Envelope of an exact duration. `finishSec` is derived last, so `over` can move the start. */
function lasting(sec: number, over: Partial<SwingEnvelope> = {}): SwingEnvelope {
  const base = envelope(over);
  return { ...base, finishSec: base.startSec + sec };
}

function candidate(startSec: number): SwingCandidate {
  return {
    startIdx: 0,
    endIdx: 10,
    startSec,
    endSec: startSec + 3,
    burstStartSec: startSec,
    burstEndSec: startSec + 3,
    peakSpeed: 1,
    visibleFrac: 0.9,
  };
}

/** A `SessionSwings` shaped like `detectSessionSwings` would return it. */
function session(
  accepted: SwingEnvelope[],
  rejects: { envelope: SwingEnvelope | null; reason: string }[] = [],
): SessionSwings {
  return {
    swings: accepted.map((env) => ({
      candidate: candidate(env.startSec),
      envelope: env,
      impactSec: env.impact?.timeSec ?? null,
      anchorSec: env.impact?.timeSec ?? env.startSec,
    })),
    rejected: rejects.map((r) => ({
      candidate: candidate(r.envelope?.startSec ?? 0),
      envelope: r.envelope,
      reason: r.reason,
    })),
    refSpeed: REF_SPEED,
    segmentation: {
      candidates: [],
      refSpeed: REF_SPEED,
      quietThreshold: 0.2,
      sampleDt: 1 / 30,
      trackedWrist: 'left',
      visibleFrac: 0.9,
      diagnostics: {
        totalFrames: 0,
        quietFrames: 0,
        movingFrames: 0,
        islands: 0,
        bursts: [],
      },
    },
  };
}

describe('passesDatasetGate — what it lets through', () => {
  it('accepts a clipped tail, which production rejects outright', () => {
    const env = envelope({ clippedTail: true });
    expect(isSwing(env, REF_SPEED).accepted).toBe(false);
    expect(passesDatasetGate(env, REF_SPEED).accepted).toBe(true);
  });

  it('accepts a slow-motion envelope well past production’s 3 s cap', () => {
    const env = lasting(6);
    expect(isSwing(env, REF_SPEED).accepted).toBe(false);
    expect(passesDatasetGate(env, REF_SPEED).accepted).toBe(true);
  });

  it('accepts a swing shorter than production’s floor but at least 0.6 s', () => {
    expect(passesDatasetGate(lasting(0.65), REF_SPEED).accepted).toBe(true);
    expect(isSwing(lasting(0.65), REF_SPEED).accepted).toBe(false);
  });

  it('accepts poor wrist visibility — a blurry frame is still annotatable', () => {
    const env = envelope({ visibleFrac: 0.2 });
    expect(isSwing(env, REF_SPEED).accepted).toBe(false);
    expect(passesDatasetGate(env, REF_SPEED).accepted).toBe(true);
  });

  it('accepts a downswing production calls too long', () => {
    const env = envelope({ impact: { topSec: 1.2, timeSec: 2.2, downswingSec: 1 } });
    expect(isSwing(env, REF_SPEED).accepted).toBe(false);
    expect(passesDatasetGate(env, REF_SPEED).accepted).toBe(true);
  });
});

describe('passesDatasetGate — what it still rejects', () => {
  it('rejects an invalid envelope: its frame times mean nothing', () => {
    const verdict = passesDatasetGate(envelope({ valid: false, reason: 'no address hold' }), REF_SPEED);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('invalid');
  });

  it('rejects a ball pickup — the hands went down, not up', () => {
    const verdict = passesDatasetGate(envelope({ addressY: 0.5, apexY: 0.49 }), REF_SPEED);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('vertical excursion');
  });

  it('rejects a gesture below the peak-speed floor', () => {
    const verdict = passesDatasetGate(envelope({ peakSpeed: 0.1 }), REF_SPEED);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('peak speed');
  });

  it('rejects outside the widened duration window on both sides', () => {
    expect(passesDatasetGate(lasting(0.4), REF_SPEED).accepted).toBe(false);
    expect(passesDatasetGate(lasting(20), REF_SPEED).accepted).toBe(false);
  });

  it('is inclusive at both bounds of the window', () => {
    expect(passesDatasetGate(lasting(DATASET_MIN_ENVELOPE_SEC), REF_SPEED).accepted).toBe(true);
    expect(passesDatasetGate(lasting(DATASET_MAX_ENVELOPE_SEC), REF_SPEED).accepted).toBe(true);
  });
});

describe('suspectMultiSwing', () => {
  it('flags only envelopes past production’s one-swing cap', () => {
    expect(isSuspectMultiSwing(lasting(MULTI_SWING_SUSPECT_SEC))).toBe(false);
    expect(isSuspectMultiSwing(lasting(MULTI_SWING_SUSPECT_SEC + 0.5))).toBe(true);
  });

  it('is never set on a production swing, whose cap is the same bound', () => {
    const set = collectDatasetSwings(session([envelope()]));
    expect(set.swings[0].suspectMultiSwing).toBe(false);
  });
});

describe('collectDatasetSwings', () => {
  it('keeps production swings and rescues the ones the relaxed gate accepts', () => {
    const set = collectDatasetSwings(
      session([lasting(1.5)], [{ envelope: lasting(6, { startSec: 10 }), reason: 'envelope too long' }]),
    );
    expect(set.swings.map((s) => s.gate)).toEqual(['production', 'dataset-relaxed']);
    expect(set.rejected).toHaveLength(0);
  });

  it('orders the merged swings by envelope start, whichever gate found them', () => {
    const set = collectDatasetSwings(
      session(
        [lasting(1.5, { startSec: 20 })],
        [{ envelope: lasting(6, { startSec: 5 }), reason: 'envelope too long' }],
      ),
    );
    expect(set.swings.map((s) => s.envelope.startSec)).toEqual([5, 20]);
    expect(set.swings.map((s) => s.gate)).toEqual(['dataset-relaxed', 'production']);
  });

  it('reports what neither gate wanted, with the relaxed gate’s reason', () => {
    const set = collectDatasetSwings(
      session([], [{ envelope: envelope({ apexY: 0.5 }), reason: 'vertical excursion …' }]),
    );
    expect(set.swings).toHaveLength(0);
    expect(set.rejected[0].reason).toContain('vertical excursion');
  });

  it('passes through a candidate that never got an envelope, with its own reason', () => {
    const set = collectDatasetSwings(
      session([], [{ envelope: null, reason: 'segment too short to analyse' }]),
    );
    expect(set.swings).toHaveLength(0);
    expect(set.rejected[0].reason).toBe('segment too short to analyse');
  });

  it('tags multi-swing suspects among the rescued', () => {
    const set = collectDatasetSwings(
      session([], [{ envelope: lasting(8), reason: 'envelope too long' }]),
    );
    expect(set.swings[0].suspectMultiSwing).toBe(true);
  });
});

describe('gateCounts', () => {
  it('counts each gate and the multi-swing flag separately', () => {
    const set = collectDatasetSwings(
      session(
        [lasting(1.5)],
        [
          { envelope: lasting(8, { startSec: 10 }), reason: 'too long' },
          { envelope: lasting(1.2, { startSec: 20, clippedTail: true }), reason: 'clipped tail' },
        ],
      ),
    );
    expect(gateCounts(set.swings)).toEqual({ production: 1, relaxed: 2, suspectMultiSwing: 1 });
  });
});

// ── DRIFT GUARDS against poseSegments.ts ─────────────────────────────────────
// Each mirrored constant is bisected against the real `isSwing`: the value itself must
// pass and a hair below (or above) must fail, naming the threshold in the reason.

describe('mirrored production thresholds still match isSwing', () => {
  it('MIN_PEAK_SPEED_FRAC is where isSwing flips', () => {
    const at = envelope({ peakSpeed: REF_SPEED * MIN_PEAK_SPEED_FRAC });
    const below = envelope({ peakSpeed: REF_SPEED * MIN_PEAK_SPEED_FRAC - 0.001 });
    expect(isSwing(at, REF_SPEED).accepted).toBe(true);
    expect(isSwing(below, REF_SPEED).reason).toContain('peak speed');
  });

  it('MIN_VERTICAL_EXCURSION is where isSwing flips', () => {
    const at = envelope({ addressY: MIN_VERTICAL_EXCURSION, apexY: 0 });
    const below = envelope({ addressY: MIN_VERTICAL_EXCURSION, apexY: 0.001 });
    expect(isSwing(at, REF_SPEED).accepted).toBe(true);
    expect(isSwing(below, REF_SPEED).reason).toContain('vertical excursion');
  });

  it('MULTI_SWING_SUSPECT_SEC is production’s one-swing envelope cap', () => {
    expect(isSwing(lasting(MULTI_SWING_SUSPECT_SEC), REF_SPEED).accepted).toBe(true);
    expect(isSwing(lasting(MULTI_SWING_SUSPECT_SEC + 0.01), REF_SPEED).reason).toContain(
      'not one swing',
    );
  });
});
