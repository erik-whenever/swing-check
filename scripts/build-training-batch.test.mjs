// Tests for the training-batch draw (scripts/build-training-batch.mjs).
//
// Two properties matter more than the rest, and both fail SILENTLY if broken:
//
//   EXCLUSION — a reserved id that leaks into a training batch is not a visible bug. It
//   is a frame that gets annotated, trained on, and then scored against as if it were
//   held out. The eval number comes back better than the truth and nothing anywhere says
//   why. So the tests push on it from several directions, including the pathological
//   pools where the draw is forced to fall back.
//
//   DETERMINISM — the batch has to be re-derivable from the same exports, or "which
//   frames were in batch-01" stops having an answer once the directory is lost.
//
// Synthetic pools throughout: the real exports are gitignored personal data.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  phaseQuotas,
  readIdList,
  excludeIds,
  selectTrainingBatch,
  prefillPhaseXml,
  frameMetaLabelsJson,
  PHASE_TARGET_WEIGHTS,
  TRAINING_SEED,
  DEFAULT_BATCH_SIZE,
} from './build-training-batch.mjs';
import { PHASE_ORDER, SELECTION_SEED } from './build-calibration-set.mjs';

/**
 * A pool shaped like the real one: `swings` swings, one frame per phase in each,
 * alternating source, ids in the extractor's `<clip>-<hash>_sNN_fNN` form.
 */
function makePool({ swings = 300, phases = PHASE_ORDER, clipsPerSource = 8 } = {}) {
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
        exportFile: 'synthetic.zip',
      });
    });
  }
  return pool;
}

const ids = (result) => result.frames.map((f) => f.id);

describe('phaseQuotas', () => {
  it('resolves the spec weights for a batch of 150', () => {
    expect(phaseQuotas(150)).toEqual({
      downswing: 51, // 34 %
      impact: 27, // 18 %
      backswing: 21, // 14 %
      top: 15, // 10 %
      through: 15, // 10 %
      address: 12, // 8 %
      finish: 9, // 6 %
    });
  });

  it('resolves the spec weights for a set of 100 — the percentages, as whole frames', () => {
    expect(phaseQuotas(100)).toEqual({
      downswing: 34,
      impact: 18,
      backswing: 14,
      top: 10,
      through: 10,
      address: 8,
      finish: 6,
    });
  });

  it('always sums to exactly n, for every size — largest remainder, not per-phase rounding', () => {
    for (let n = 1; n <= 400; n++) {
      const total = Object.values(phaseQuotas(n)).reduce((a, b) => a + b, 0);
      expect(total, `n=${n}`).toBe(n);
    }
  });

  it('never emits a negative quota, even when n is smaller than the phase count', () => {
    for (let n = 1; n <= 7; n++) {
      const q = phaseQuotas(n);
      expect(Object.values(q).every((v) => v >= 0), `n=${n}`).toBe(true);
      expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it('gives the heaviest phase the most frames', () => {
    const q = phaseQuotas(150);
    const heaviest = PHASE_ORDER.reduce((a, b) => (PHASE_TARGET_WEIGHTS[b] > PHASE_TARGET_WEIGHTS[a] ? b : a));
    expect(heaviest).toBe('downswing');
    expect(Math.max(...Object.values(q))).toBe(q.downswing);
  });

  it('is a pure function of n and the weights', () => {
    expect(phaseQuotas(150)).toEqual(phaseQuotas(150));
  });
});

describe('readIdList', () => {
  let dir;
  const withDir = (fn) => {
    dir = mkdtempSync(path.join(tmpdir(), 'swingcheck-ids-'));
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('THROWS LOUDLY when a required list is missing — never silently "nothing to exclude"', () => {
    withDir((d) => {
      const missing = path.join(d, 'reserved-ids.txt');
      expect(() => readIdList(missing, { required: true })).toThrow(/MISSING REQUIRED FILE/);
      // The message has to explain the consequence, not just name the file.
      expect(() => readIdList(missing, { required: true })).toThrow(/memorisation score/);
    });
  });

  it('returns an empty set for a missing optional list', () => {
    withDir((d) => {
      expect(readIdList(path.join(d, 'nope.txt')).size).toBe(0);
    });
  });

  it('ignores blank lines, comments and surrounding whitespace', () => {
    withDir((d) => {
      const file = path.join(d, 'ids.txt');
      writeFileSync(file, '# a comment\n\n  a_s00_f00  \nb_s00_f01\n\n# another\n');
      expect([...readIdList(file)].sort()).toEqual(['a_s00_f00', 'b_s00_f01']);
    });
  });

  it('reads CRLF files — these are written and read on Windows', () => {
    withDir((d) => {
      const file = path.join(d, 'ids.txt');
      writeFileSync(file, 'a_s00_f00\r\nb_s00_f01\r\n');
      expect([...readIdList(file)].sort()).toEqual(['a_s00_f00', 'b_s00_f01']);
    });
  });
});

describe('excludeIds', () => {
  it('removes the excluded frames and counts what it hit', () => {
    const pool = makePool({ swings: 4 });
    const excluded = new Set([pool[0].id, pool[5].id]);
    const { kept, removedCount, missing } = excludeIds(pool, excluded);
    expect(kept).toHaveLength(pool.length - 2);
    expect(removedCount).toBe(2);
    expect(missing).toEqual([]);
    expect(kept.some((f) => excluded.has(f.id))).toBe(false);
  });

  it('reports excluded ids that are not in the pool — the export they came from is missing', () => {
    const pool = makePool({ swings: 2 });
    const { removedCount, missing } = excludeIds(pool, new Set([pool[0].id, 'ghost_s99_f99']));
    expect(removedCount).toBe(1);
    expect(missing).toEqual(['ghost_s99_f99']);
  });

  it('does not mutate the pool it is given', () => {
    const pool = makePool({ swings: 3 });
    const before = pool.length;
    excludeIds(pool, new Set([pool[0].id]));
    expect(pool).toHaveLength(before);
  });
});

describe('selectTrainingBatch — exclusion', () => {
  it('draws no reserved id, ever', () => {
    const pool = makePool();
    // Reserve a large, phase-spanning slice: every 3rd frame.
    const reserved = new Set(pool.filter((_, i) => i % 3 === 0).map((f) => f.id));
    const result = selectTrainingBatch(pool, reserved, { size: 150 });

    expect(result.frames).toHaveLength(150);
    for (const id of ids(result)) expect(reserved.has(id)).toBe(false);
  });

  it('still draws nothing reserved when the reserved set dominates a whole phase', () => {
    const pool = makePool();
    // Every downswing frame is reserved — the heaviest quota (34 %) cannot be filled at
    // all, so the draw is forced down its fill-from-elsewhere path. That path is exactly
    // where an exclusion bug would surface.
    const reserved = new Set(pool.filter((f) => f.phase === 'downswing').map((f) => f.id));
    const result = selectTrainingBatch(pool, reserved, { size: 150 });

    expect(result.frames).toHaveLength(150);
    expect(result.byPhase.downswing ?? 0).toBe(0);
    for (const id of ids(result)) expect(reserved.has(id)).toBe(false);
  });

  it('draws a short batch rather than dipping into reserved frames when the pool runs out', () => {
    // 40 swings × 7 phases = 280 frames, of which all but 30 are reserved. A draw that
    // "tops up to n" from anywhere would have to break the exclusion to reach 150.
    const pool = makePool({ swings: 40 });
    const free = pool.slice(0, 30).map((f) => f.id);
    const reserved = new Set(pool.map((f) => f.id).filter((id) => !free.includes(id)));

    const result = selectTrainingBatch(pool, reserved, { size: 150 });
    expect(result.frames.length).toBeLessThanOrEqual(30);
    for (const id of ids(result)) expect(reserved.has(id)).toBe(false);
  });

  it('handles an empty pool after exclusion without throwing', () => {
    const pool = makePool({ swings: 5 });
    const result = selectTrainingBatch(pool, new Set(pool.map((f) => f.id)), { size: 150 });
    expect(result.frames).toEqual([]);
    expect(result.poolAfterExclusion).toBe(0);
  });

  it('excludes an earlier batch as well as the calibration set, so a frame is never drawn twice', () => {
    const pool = makePool();
    const reserved = new Set(pool.slice(0, 100).map((f) => f.id));

    const first = selectTrainingBatch(pool, reserved, { size: 150 });
    const second = selectTrainingBatch(pool, new Set([...reserved, ...ids(first)]), { size: 150 });

    expect(second.frames).toHaveLength(150);
    const overlap = ids(second).filter((id) => ids(first).includes(id));
    expect(overlap).toEqual([]);
    for (const id of ids(second)) expect(reserved.has(id)).toBe(false);
  });

  it('reports the exclusion bookkeeping the summary prints', () => {
    const pool = makePool({ swings: 50 });
    const reserved = new Set([...pool.slice(0, 20).map((f) => f.id), 'ghost_s00_f00']);
    const result = selectTrainingBatch(pool, reserved, { size: 30 });

    expect(result.excludedFromPool).toBe(20);
    expect(result.excludedNotInPool).toEqual(['ghost_s00_f00']);
    expect(result.poolAfterExclusion).toBe(pool.length - 20);
  });
});

describe('selectTrainingBatch — determinism', () => {
  it('draws the same ids from the same pool', () => {
    const reserved = new Set(makePool().slice(0, 100).map((f) => f.id));
    const a = selectTrainingBatch(makePool(), reserved, { size: 150 });
    const b = selectTrainingBatch(makePool(), reserved, { size: 150 });
    expect(ids(a)).toEqual(ids(b));
  });

  it('is independent of the order the exports happened to be read in', () => {
    const pool = makePool();
    const reserved = new Set(pool.slice(0, 100).map((f) => f.id));
    const reversed = [...pool].reverse();
    const rotated = [...pool.slice(137), ...pool.slice(0, 137)];

    const base = ids(selectTrainingBatch(pool, reserved, { size: 150 }));
    expect(ids(selectTrainingBatch(reversed, reserved, { size: 150 }))).toEqual(base);
    expect(ids(selectTrainingBatch(rotated, reserved, { size: 150 }))).toEqual(base);
  });

  it('is independent of the iteration order of the excluded set', () => {
    const pool = makePool();
    const list = pool.slice(0, 100).map((f) => f.id);
    const a = selectTrainingBatch(pool, new Set(list), { size: 150 });
    const b = selectTrainingBatch(pool, new Set([...list].reverse()), { size: 150 });
    expect(ids(a)).toEqual(ids(b));
  });

  it('returns frames in a stable, id-sorted order', () => {
    const result = selectTrainingBatch(makePool(), new Set(), { size: 150 });
    expect(ids(result)).toEqual([...ids(result)].sort());
  });

  it('changes the draw when the seed changes — the seed is doing something', () => {
    const pool = makePool();
    const a = ids(selectTrainingBatch(pool, new Set(), { size: 150, seed: TRAINING_SEED }));
    const b = ids(selectTrainingBatch(pool, new Set(), { size: 150, seed: TRAINING_SEED + 1 }));
    expect(a).not.toEqual(b);
  });

  it('uses a different seed from the calibration draw, and lands on a different set', () => {
    // Sharing a seed would correlate the two shuffles and pull the training batch towards
    // the frames that just missed the calibration cut.
    expect(TRAINING_SEED).not.toBe(SELECTION_SEED);
    const pool = makePool();
    const training = ids(selectTrainingBatch(pool, new Set(), { size: 100, seed: TRAINING_SEED }));
    const calibrationLike = ids(selectTrainingBatch(pool, new Set(), { size: 100, seed: SELECTION_SEED }));
    expect(training).not.toEqual(calibrationLike);
  });
});

describe('selectTrainingBatch — shape of the draw', () => {
  it('hits every phase quota when the pool allows, and balances the sources', () => {
    const result = selectTrainingBatch(makePool(), new Set(), { size: DEFAULT_BATCH_SIZE });
    const quotas = phaseQuotas(DEFAULT_BATCH_SIZE);
    for (const phase of PHASE_ORDER) expect(result.byPhase[phase] ?? 0, phase).toBe(quotas[phase]);
    expect(result.bySource.web).toBe(75);
    expect(result.bySource.own).toBe(75);
  });

  it('spreads over swings — one frame per swing while the pool has swings to spare', () => {
    const result = selectTrainingBatch(makePool(), new Set(), { size: 150 });
    expect(result.maxFramesPerSwing).toBe(1);
    expect(result.swingCount).toBe(150);
  });
});

describe('CVAT pre-fill output', () => {
  const frames = [
    { id: 'a-clip_s00_f00', phase: 'downswing' },
    { id: 'b-clip_s01_f03', phase: 'top' },
  ];

  it('emits one <image> per frame carrying the phase as a tag attribute', () => {
    const xml = prefillPhaseXml(frames);
    expect(xml).toContain('<image id="0" name="frames/a-clip_s00_f00.jpg">');
    expect(xml).toContain('<image id="1" name="frames/b-clip_s01_f03.jpg">');
    expect(xml).toContain('<attribute name="phase">downswing</attribute>');
    expect(xml).toContain('<attribute name="phase">top</attribute>');
    expect((xml.match(/<tag label="frame_meta"/g) ?? [])).toHaveLength(2);
  });

  it('declares the tag label and every phase value in <meta>', () => {
    const xml = prefillPhaseXml(frames);
    expect(xml).toContain('<type>tag</type>');
    expect(xml).toContain('<input_type>select</input_type>');
    for (const phase of PHASE_ORDER) expect(xml).toContain(phase);
  });

  it('numbers images from 0 in the order given — CVAT matches frames by that order', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, phase: 'top' }));
    const xml = prefillPhaseXml(many);
    expect([...xml.matchAll(/<image id="(\d+)"/g)].map((m) => m[1])).toEqual(['0', '1', '2', '3', '4']);
  });

  it('escapes XML metacharacters in ids rather than emitting broken markup', () => {
    const xml = prefillPhaseXml([{ id: 'a&b<c>"d', phase: 'top' }]);
    expect(xml).toContain('name="frames/a&amp;b&lt;c&gt;&quot;d.jpg"');
    expect(xml).not.toMatch(/name="frames\/a&b/);
  });

  it('emits a labels file that is valid JSON with phase as a select attribute', () => {
    const parsed = JSON.parse(frameMetaLabelsJson());
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('frame_meta');
    expect(parsed[0].type).toBe('tag');
    const phase = parsed[0].attributes.find((a) => a.name === 'phase');
    expect(phase.input_type).toBe('select');
    expect([...phase.values].sort()).toEqual([...PHASE_ORDER].sort());
  });
});
