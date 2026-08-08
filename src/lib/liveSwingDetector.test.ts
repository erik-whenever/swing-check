// Live incremental detection harness (D-5 pass 2, ADR-003 §4).
//
// The live path runs the SAME chain as the clip path, just repeatedly over a sliding
// window instead of once over a finished clip. So the property worth testing is
// agreement: replaying a frozen fixture sample-by-sample through the ring buffer and
// the incremental detector must report exactly the swings that `detectSessionSwings`
// finds in one batch pass — no more (double counting as the window slides) and no
// fewer (a swing lost at a window boundary).
//
// This is the only part of the live path that can be tested without a camera. The rAF
// loop, the cadence switch and the inference timing are browser-bound and are measured
// in the field instead (see LiveSwingPanel + the `Live pose stats` WARN lines).

import { describe, expect, it } from 'vitest';
import { LiveSwingDetector } from './liveSwingDetector';
import { detectSessionSwings } from './poseSegments';
import { PoseRingBuffer } from './poseRingBuffer';
import type { PoseSample } from './poseTrajectory';

/** Detection cadence used live (useLiveSwingDetection.DETECT_INTERVAL_SEC). */
const DETECT_INTERVAL_SEC = 0.5;
/** Ring capacity used live — ~30 s at 15 fps. */
const RING_CAPACITY = 450;
/** ±2 sample frames, the same tolerance the other pose harnesses use. */
const TOL_SEC = 2 / 15;

interface FixtureFile {
  samples: PoseSample[];
}
const rawFixtures = import.meta.glob<FixtureFile>('./__fixtures__/*.json', {
  eager: true,
  import: 'default',
});
const fixtures = new Map<string, FixtureFile>();
for (const [path, data] of Object.entries(rawFixtures)) {
  fixtures.set(path.split('/').pop()!.replace(/\.json$/, ''), data);
}

/**
 * Replay a fixture exactly as the live loop would: push each sample into the ring
 * buffer, and run the detector over the current window every DETECT_INTERVAL_SEC.
 */
function replay(samples: PoseSample[], capacity = RING_CAPACITY) {
  const buffer = new PoseRingBuffer(capacity);
  const detector = new LiveSwingDetector();
  const reports = [];
  let lastDetectAt = Number.NEGATIVE_INFINITY;
  let runs = 0;
  for (const s of samples) {
    buffer.push(s);
    if (s.t - lastDetectAt < DETECT_INTERVAL_SEC) continue;
    lastDetectAt = s.t;
    runs++;
    reports.push(...detector.run(buffer.toArray(), s.t).reports);
  }
  return { reports, detector, runs };
}

describe('LiveSwingDetector — incremental replay agrees with the batch chain', () => {
  for (const name of ['session-multi', 'dtl-full', 'face-on', 'dtl-clipped'] as const) {
    const fixture = fixtures.get(name);

    if (!fixture) {
      it.todo(`${name}: fixture missing — export it from the dev preview`);
      continue;
    }

    it(`${name}: reports exactly the swings the batch pass finds`, () => {
      const batch = detectSessionSwings(fixture.samples);
      const { reports } = replay(fixture.samples);

      expect(reports).toHaveLength(batch.swings.length);
      reports.forEach((r, i) => {
        expect(
          Math.abs(r.anchorSec - batch.swings[i].anchorSec),
          `swing ${i + 1} anchor ${r.anchorSec} vs batch ${batch.swings[i].anchorSec}`,
        ).toBeLessThanOrEqual(TOL_SEC);
      });
      // Indices are 1-based and gap-free — this is the number shown in the dev counter.
      expect(reports.map((r) => r.index)).toEqual(reports.map((_, i) => i + 1));
    });

    it(`${name}: never reports the same swing twice as the window slides`, () => {
      const { reports, runs } = replay(fixture.samples);
      // Many detection passes see the same swing; only the first may report it.
      expect(runs).toBeGreaterThan(reports.length);
      for (let i = 1; i < reports.length; i++) {
        expect(reports[i].anchorSec - reports[i - 1].anchorSec).toBeGreaterThan(2);
      }
    });
  }
});

describe('LiveSwingDetector — reporting semantics', () => {
  const multi = fixtures.get('session-multi');

  it('reports a swing only AFTER its finish has settled (positive latency)', () => {
    if (!multi) return;
    const { reports } = replay(multi.samples);
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      // The gate rejects `clippedTail`, so a swing cannot be reported before its
      // follow-through has been held — latency is structural, not a scheduling delay.
      expect(r.latencySec).toBeGreaterThan(0);
      expect(r.detectedAtSec).toBeGreaterThanOrEqual(r.envelopeSec[1]);
    }
  });

  it('carries the fields the WARN line and the dev counter read', () => {
    if (!multi) return;
    const { reports } = replay(multi.samples);
    for (const r of reports) {
      expect(r.envelopeSec[1]).toBeGreaterThan(r.envelopeSec[0]);
      // Excursion is the ball-pickup discriminator: hands must have gone UP.
      expect(r.excursion).toBeGreaterThan(0);
      expect(r.peakSpeed).toBeGreaterThan(0);
      // Impact is polish, so it may be null — but when present it sits in the envelope.
      if (r.impactSec !== null) {
        expect(r.impactSec).toBeGreaterThanOrEqual(r.envelopeSec[0]);
        expect(r.impactSec).toBeLessThanOrEqual(r.envelopeSec[1]);
      }
    }
  });

  it('counts and resets', () => {
    if (!multi) return;
    const { detector, reports } = replay(multi.samples);
    expect(detector.count).toBe(reports.length);
    detector.reset();
    expect(detector.count).toBe(0);
    // After a reset the same window is new again — proving dedupe state, not the
    // samples, is what suppresses repeats.
    const again = detector.run(multi.samples.slice(0, 400), 30);
    expect(again.reports.length).toBeGreaterThan(0);
  });

  it('an empty or tiny window degrades to zero, never throws', () => {
    const detector = new LiveSwingDetector();
    expect(detector.run([], 0).reports).toEqual([]);
    expect(detector.run([{ t: 0, landmarks: [] }], 0.1).reports).toEqual([]);
    expect(detector.count).toBe(0);
  });
});
