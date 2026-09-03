// Tests for the calibration-set draw (scripts/build-calibration-set.mjs).
//
// The three properties that actually matter are the ones a broken draw would lose
// quietly: the set must be REPRODUCIBLE (it becomes a permanent eval set, so a
// re-run a year from now has to yield the same ids), it must hit the phase quotas,
// and it must not stack several near-identical frames from one swing.

import { describe, it, expect } from 'vitest';
import {
  selectCalibrationSet,
  swingKey,
  buildZip,
  openZipBuffer,
  readEntry,
  PHASE_QUOTAS,
  PHASE_ORDER,
  CALIBRATION_SIZE,
} from './build-calibration-set.mjs';

/**
 * A pool shaped like a real export: `swings` swings, each with one frame per phase
 * in `phases`, alternating source. Ids follow the extractor's `<clip>_sNN_fNN` form.
 */
function makePool({ swings = 40, phases = PHASE_ORDER, clipsPerSource = 4 } = {}) {
  const pool = [];
  for (let s = 0; s < swings; s++) {
    const source = s % 2 === 0 ? 'web' : 'own';
    const clipName = `${source}-clip-${s % clipsPerSource}.mp4`;
    const swingIndex = Math.floor(s / clipsPerSource);
    phases.forEach((phase, f) => {
      pool.push({
        id: `${source}-clip-${s % clipsPerSource}-abcd0000_s${String(swingIndex).padStart(2, '0')}_f${String(f).padStart(2, '0')}`,
        clipName,
        swingIndex,
        frameIndex: f,
        phase,
        source,
        tSec: f * 0.1,
      });
    });
  }
  return pool;
}

const ids = (result) => result.frames.map((f) => f.id);

describe('selectCalibrationSet — determinism', () => {
  it('gives the same set for the same pool', () => {
    const pool = makePool({ swings: 200 });
    expect(ids(selectCalibrationSet(pool))).toEqual(ids(selectCalibrationSet(pool)));
  });

  it('is independent of the order the pool was read in', () => {
    const pool = makePool({ swings: 200 });
    const reversed = [...pool].reverse();
    const rotated = [...pool.slice(37), ...pool.slice(0, 37)];
    const expected = ids(selectCalibrationSet(pool));
    expect(ids(selectCalibrationSet(reversed))).toEqual(expected);
    expect(ids(selectCalibrationSet(rotated))).toEqual(expected);
  });

  it('changes the draw when the seed changes (the seed is doing something)', () => {
    const pool = makePool({ swings: 200 });
    const a = ids(selectCalibrationSet(pool));
    const b = ids(selectCalibrationSet(pool, { seed: 1234 }));
    expect(b).not.toEqual(a);
    expect(b).toHaveLength(a.length);
  });

  it('returns frames sorted by id', () => {
    const result = selectCalibrationSet(makePool({ swings: 200 }));
    expect(ids(result)).toEqual([...ids(result)].sort());
  });
});

describe('selectCalibrationSet — phase distribution', () => {
  it('hits every quota exactly when the pool is rich enough', () => {
    const result = selectCalibrationSet(makePool({ swings: 200 }));
    expect(result.frames).toHaveLength(CALIBRATION_SIZE);
    expect(result.byPhase).toEqual(PHASE_QUOTAS);
    expect(result.filledFromDownswing).toBe(0);
    expect(result.filledFromAnyPhase).toBe(0);
  });

  it('quotas sum to the set size', () => {
    expect(Object.values(PHASE_QUOTAS).reduce((a, b) => a + b, 0)).toBe(CALIBRATION_SIZE);
  });

  it('makes up a short phase from downswing', () => {
    // No `finish` frames anywhere, and downswing available in surplus.
    const pool = makePool({ swings: 200, phases: PHASE_ORDER.filter((p) => p !== 'finish') });
    const result = selectCalibrationSet(pool);
    expect(result.frames).toHaveLength(CALIBRATION_SIZE);
    expect(result.byPhase.finish ?? 0).toBe(0);
    expect(result.shortfallByPhase.finish).toBe(PHASE_QUOTAS.finish);
    expect(result.filledFromDownswing).toBe(PHASE_QUOTAS.finish);
    expect(result.byPhase.downswing).toBe(PHASE_QUOTAS.downswing + PHASE_QUOTAS.finish);
    expect(result.filledFromAnyPhase).toBe(0);
  });

  it('falls back to other phases only when downswing cannot cover the shortfall', () => {
    // 60 swings of downswing-less material: quotas for the other phases are met, the
    // downswing 40 has nothing to draw on, and the fill has to come from elsewhere.
    const pool = makePool({ swings: 60, phases: PHASE_ORDER.filter((p) => p !== 'downswing') });
    const result = selectCalibrationSet(pool);
    expect(result.byPhase.downswing ?? 0).toBe(0);
    expect(result.filledFromDownswing).toBe(0);
    expect(result.filledFromAnyPhase).toBeGreaterThan(0);
    expect(result.frames).toHaveLength(CALIBRATION_SIZE);
  });

  it('returns a short set rather than inventing frames', () => {
    const pool = makePool({ swings: 5 }); // 35 frames total
    const result = selectCalibrationSet(pool);
    expect(result.frames).toHaveLength(pool.length);
    expect(new Set(ids(result)).size).toBe(pool.length);
  });
});

describe('selectCalibrationSet — spread across swings', () => {
  it('takes at most one frame per swing when the pool has swings to spare', () => {
    const result = selectCalibrationSet(makePool({ swings: 200 }));
    const perSwing = new Map();
    for (const f of result.frames) perSwing.set(swingKey(f), (perSwing.get(swingKey(f)) ?? 0) + 1);
    expect(Math.max(...perSwing.values())).toBe(1);
    expect(result.maxFramesPerSwing).toBe(1);
    expect(result.swingCount).toBe(CALIBRATION_SIZE);
  });

  it('reuses swings only as far as it must, and spreads evenly when it does', () => {
    const pool = makePool({ swings: 30 }); // 30 swings for 100 frames → 3–4 each
    const result = selectCalibrationSet(pool);
    expect(result.frames).toHaveLength(CALIBRATION_SIZE);
    expect(result.swingCount).toBe(30);
    expect(result.maxFramesPerSwing).toBeLessThanOrEqual(4);
  });

  it('never picks the same frame twice', () => {
    const result = selectCalibrationSet(makePool({ swings: 30 }));
    expect(new Set(ids(result)).size).toBe(result.frames.length);
  });
});

describe('selectCalibrationSet — source balance', () => {
  it('splits roughly evenly between web and own', () => {
    const result = selectCalibrationSet(makePool({ swings: 200 }));
    expect(Math.abs(result.bySource.web - result.bySource.own)).toBeLessThanOrEqual(2);
  });

  it('does not stall when one source is scarce', () => {
    const pool = makePool({ swings: 200 }).filter((f) => f.source === 'web' || f.frameIndex === 0);
    const result = selectCalibrationSet(pool);
    expect(result.frames).toHaveLength(CALIBRATION_SIZE);
    expect(result.bySource.own).toBeGreaterThan(0);
  });
});

describe('zip round-trip', () => {
  it('reads back what it wrote', () => {
    const files = [
      { path: 'manifest.json', data: Buffer.from('{"calibration":true}', 'utf8') },
      { path: 'frames/åäö-01.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
    ];
    const zip = openZipBuffer(buildZip(files));
    expect([...zip.entries.keys()]).toEqual(['manifest.json', 'frames/åäö-01.jpg']);
    expect(readEntry(zip, 'manifest.json').toString('utf8')).toBe('{"calibration":true}');
    expect(readEntry(zip, 'frames/åäö-01.jpg')).toEqual(files[1].data);
  });
});
