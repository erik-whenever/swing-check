// Regression harness for the envelope logic (Ström D).
//
// Replaces the manual "load 3 clips in the browser, read the logs" round: runs
// detectSwingEnvelope + selectEnvelopeFrames against FROZEN pose-landmark fixtures
// (src/lib/__fixtures__/*.json, captured once via the dev-preview export button)
// and asserts the checkpoint-2 golden values. MediaPipe is deterministic enough
// that the landmark series only has to be captured once — see __fixtures__/README.md.
//
// This mirrors frameExtractor.ts's PRODUCTION path exactly (selectViaPose):
//   detectSwingEnvelope(samples) → selectEnvelopeFrames(envelope, BUDGET,
//   samples[0].t, samples.at(-1).t). So a regression here is a regression in what
//   the real app would send to Claude.
//
// Times are asserted with ±1-frame tolerance (derived from each fixture's own
// sample dt), never exact equality — MediaPipe/seek jitter moves boundaries by a
// frame without being a real regression. Frame COUNT is asserted exactly so a
// budget regression (e.g. dedupe silently dropping picks) is caught.
//
// A fixture that hasn't been captured yet is reported as `todo`, so the suite
// stays green until Erik drops the JSON in — it never blocks `npm test`.

import { describe, it, expect } from 'vitest';
import { detectSwingEnvelope } from './poseEnvelope';
import { selectEnvelopeFrames } from './poseEnvelopeSelection';
import type { PoseSample } from './poseTrajectory';

/** Production frame budget — must equal frameExtractor.ts's ANALYSIS_FRAME_COUNT
 *  (the single source of truth for frames/swing sent to Claude), which selectViaPose
 *  forwards straight into selectEnvelopeFrames. Kept as a local literal (not an import)
 *  so the harness stays self-contained; bump both together if the production count moves. */
const BUDGET = 20;

/** Tolerance for time asserts: ±1 sample frame (from the fixture's own dt) plus a
 *  float epsilon. Golden times are rounded to 2 decimals, well inside this. */
const TOL_FRAMES = 1;

interface EnvelopeGolden {
  /** Fixture file stem in __fixtures__/ (without .json). */
  fixture: string;
  description: string;
  /** Expected [startSec, finishSec]; null → don't assert boundaries for this clip. */
  envelope: [number, number] | null;
  /** Expected confident impact time; null → expect NO confident impact. */
  impactSec: number | null;
  clippedTail: boolean;
  impactClusterApplied: boolean;
  /** Exact number of frames the selection must yield (budget-regression guard). */
  frameCount: number;
}

// ── Golden values (checkpoint 2 — DTL, DTL clipped, face-on) ────────────────────
// To add a clip: export its fixture from the dev preview into __fixtures__/, then
// add a row here with the values the dev-preview EnvelopeSummary showed.
const GOLDENS: EnvelopeGolden[] = [
  {
    fixture: 'dtl-full',
    description: 'DTL full swing — envelope [6.78→8.38], confident impact ~7.85',
    envelope: [6.78, 8.38],
    impactSec: 7.85,
    clippedTail: false,
    impactClusterApplied: true,
    // 16, not BUDGET: with a confident impact the cluster (spacing 0.06s) overlaps
    // the uniform baseline over this short (~1.6s) envelope, and dedupe (0.03s)
    // merges the near-duplicates. This is exactly what production sends to Claude.
    frameCount: 16,
  },
  {
    fixture: 'dtl-clipped',
    description: 'DTL clipped tail — clippedTail, no impact, uniform baseline',
    envelope: null, // boundaries not part of the checkpoint-2 golden for this clip
    impactSec: null,
    clippedTail: true,
    impactClusterApplied: false,
    frameCount: BUDGET,
  },
  {
    fixture: 'face-on',
    description: 'Face-on full swing — envelope [3.35→4.83], impact ~4.29',
    envelope: [3.35, 4.83],
    impactSec: 4.29,
    clippedTail: false,
    impactClusterApplied: true,
    // 16, not BUDGET — same cluster/baseline dedupe collapse as dtl-full (short
    // envelope + confident impact). dtl-clipped keeps BUDGET: no impact → pure
    // uniform baseline, nothing to dedupe.
    frameCount: 16,
  },
];

// ── Fixture loading ─────────────────────────────────────────────────────────────
// Eager glob so a missing file is simply absent from the map (→ a `todo` case),
// never a thrown import error.
interface FixtureFile {
  samples: PoseSample[];
}
const rawFixtures = import.meta.glob<FixtureFile>('./__fixtures__/*.json', {
  eager: true,
  import: 'default',
});
const fixtures = new Map<string, FixtureFile>();
for (const [path, data] of Object.entries(rawFixtures)) {
  const stem = path.split('/').pop()!.replace(/\.json$/, '');
  fixtures.set(stem, data);
}

function medianDt(samples: PoseSample[]): number {
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) dts.push(samples[i].t - samples[i - 1].t);
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)] || 1 / 15;
}

/** Assert |actual − expected| ≤ tol — an absolute window (unlike toBeCloseTo, which
 *  works in decimal-digit precision). Used for the ±1-frame time asserts. */
function expectWithin(actual: number, expected: number, tol: number): void {
  expect(
    Math.abs(actual - expected),
    `${actual} should be within ${tol} of ${expected}`,
  ).toBeLessThanOrEqual(tol);
}

describe('envelope regression (frozen fixtures)', () => {
  for (const g of GOLDENS) {
    const fx = fixtures.get(g.fixture);

    if (!fx) {
      // Not captured yet — keep the suite green, but make the gap visible.
      it.todo(
        `${g.fixture}: fixture missing — export from dev preview into src/lib/__fixtures__/${g.fixture}.json`,
      );
      continue;
    }

    it(`${g.fixture}: ${g.description}`, () => {
      const samples = fx.samples;
      expect(samples.length).toBeGreaterThan(6);

      // PRODUCTION path (frameExtractor.selectViaPose), replicated exactly.
      const envelope = detectSwingEnvelope(samples);
      expect(envelope.valid).toBe(true);

      const spanStart = samples[0].t;
      const spanEnd = samples[samples.length - 1].t;
      const sel = selectEnvelopeFrames(envelope, BUDGET, spanStart, spanEnd);

      const tol = medianDt(samples) * TOL_FRAMES + 1e-6;

      // ── Envelope boundaries ──
      if (g.envelope) {
        expectWithin(envelope.startSec, g.envelope[0], tol);
        expectWithin(envelope.finishSec, g.envelope[1], tol);
      }

      // ── clipped tail ──
      expect(envelope.clippedTail).toBe(g.clippedTail);

      // ── impact (confident-only) ──
      if (g.impactSec === null) {
        expect(envelope.impact).toBeNull();
      } else {
        expect(envelope.impact).not.toBeNull();
        expectWithin(envelope.impact!.timeSec, g.impactSec, tol);
      }

      // ── impact cluster + frame budget ──
      expect(sel.impactClusterApplied).toBe(g.impactClusterApplied);
      expect(sel.usedEnvelope).toBe(true);
      expect(sel.picks.length).toBe(g.frameCount);
    });
  }
});
