// The derived phase, and — the part this file exists for — the fact that it says so.
//
// S-23 read the 22 frames the production path picks as `top` and found 13 of them were
// not the top (docs/shaft/phase-audit/resultat.md). The error changes direction with the
// branch that produced the label: the fallback lands too LATE (5 of 5 wrong, all at
// envelope fraction 0,484), the impact-anchored one too EARLY (7 of 8 wrong rows were
// `backswing`). Both branches are inferences; neither is an observation. That is what
// `derivePhaseWithSource` has to report, in every branch, so that `topFrame` in
// `derived.ts` can refuse to anchor on either.

import { describe, expect, it } from 'vitest';
import type { SwingEnvelope } from '../poseEnvelope';
import { derivePhase, derivePhaseWithSource } from './datasetPhase';

/** A 2 s envelope. `topSec`/`impactSec` null → no confident impact. */
function envelope(topSec: number | null = 0.8, impactSec = 1.2): SwingEnvelope {
  return {
    valid: true,
    startSec: 0,
    finishSec: 2,
    clippedTail: false,
    impact:
      topSec === null
        ? null
        : { topSec, timeSec: impactSec, downswingSec: impactSec - topSec },
    impactReason: 'fixture',
    trackedWrist: 'right',
    visibleFrac: 1,
    sampleDt: 1 / 15,
    addressY: 900,
    apexY: 300,
    finishY: 400,
    peakSpeed: 1,
  };
}

describe('derivePhaseWithSource', () => {
  it('names the fallback when the envelope carries no confident impact', () => {
    // `FALLBACK_BOUNDS` puts `top` in [0.45, 0.52] of the envelope — 0.97 s here is
    // 48,5 % in, which is the fraction S-23 found on every one of the five wrong
    // fallback rows. The label says `top`; the source says nobody saw one.
    const d = derivePhaseWithSource(0.97, envelope(null));
    expect(d.phase).toBe('top');
    expect(d.source).toBe('envelope-fallback');
  });

  it('names the impact anchoring when the envelope has one', () => {
    const d = derivePhaseWithSource(0.8, envelope(0.8));
    expect(d.phase).toBe('top');
    expect(d.source).toBe('envelope-impact');
  });

  it('never reports an observed phase, whatever the envelope or the time', () => {
    // The whole function is an inference. If this ever fails, a derived label has been
    // handed the one value that makes a top-anchored measurement answer with a number.
    for (const env of [envelope(), envelope(null)]) {
      for (const t of [-1, 0, 0.3, 0.8, 0.97, 1.2, 1.8, 2, 5]) {
        expect(derivePhaseWithSource(t, env).source).not.toBe('observed');
      }
    }
  });

  it('agrees with `derivePhase` frame for frame', () => {
    // The provenance is added beside the phase, never instead of it: the two entry
    // points must not drift, or a caller could pick the one that suits it.
    for (const env of [envelope(), envelope(null)]) {
      for (const t of [0, 0.05, 0.3, 0.8, 0.97, 1.2, 1.5, 1.9, 2]) {
        expect(derivePhaseWithSource(t, env).phase).toBe(derivePhase(t, env));
      }
    }
  });
});
