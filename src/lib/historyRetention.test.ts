// The web history's media retention (N-3.5): core's plan applied to IndexedDB records.
// idb-keyval is replaced by an in-memory Map so the full read → plan → write-back runs.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SwingRecord } from '@swingcheck/core/types';
import { DEFAULT_MEDIA_CAP_MB, mbToBytes } from '@swingcheck/core/lib/mediaRetention';
import {
  enforceHistoryMediaCap,
  historyKey,
  measureSwingMedia,
  purgeSwingMedia,
  readHistoryRecords,
} from './historyRetention';

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
  keys: async () => [...store.keys()],
}));

const MB = 1024 * 1024;

function swing(id: string, timestamp: number, videoMb: number, frameChars = 0): SwingRecord {
  return {
    id,
    timestamp,
    videoBlob: new Blob([new Uint8Array(Math.round(videoMb * MB))]),
    frames: frameChars > 0 ? ['a'.repeat(frameChars)] : [],
    results: [{ ruleId: `r-${id}`, verdict: 'pass' } as unknown as SwingRecord['results'][number]],
    overallAssessment: `assessment ${id}`,
  };
}

function seed(...records: SwingRecord[]) {
  for (const r of records) store.set(historyKey(r), r);
}

beforeEach(() => store.clear());

describe('measureSwingMedia', () => {
  it('counts the blob size and the stored base64 characters', () => {
    const r = swing('a', 1, 2, 1000);
    expect(measureSwingMedia(r)).toEqual({ id: 'a', timestamp: 1, videoBytes: 2 * MB, framesBytes: 1000 });
  });

  it('treats an empty session-swing blob as no video', () => {
    expect(measureSwingMedia(swing('s', 1, 0)).videoBytes).toBe(0);
  });
});

describe('purgeSwingMedia', () => {
  it('returns nothing when under the cap', () => {
    expect(purgeSwingMedia([swing('a', 1, 1), swing('b', 2, 1)], 3 * MB)).toEqual([]);
  });

  it('drops video from the oldest first and keeps results and metadata', () => {
    const old = swing('old', 1, 2, 10);
    const mid = swing('mid', 2, 2, 10);
    const now = swing('now', 3, 2, 10);
    const changed = purgeSwingMedia([now, mid, old], 5 * MB);
    expect(changed.map((r) => r.id)).toEqual(['old']);
    const [purged] = changed;
    expect(purged.videoBlob.size).toBe(0);
    expect(purged.videoPurged).toBe(true);
    expect(purged.frames).toEqual(old.frames);
    expect(purged.framesPurged).toBeUndefined();
    expect(purged.results).toEqual(old.results);
    expect(purged.overallAssessment).toBe(old.overallAssessment);
    expect(purged.timestamp).toBe(old.timestamp);
  });

  it('drops frames, oldest first, only once every video is gone', () => {
    const a = swing('a', 1, 1, 600_000);
    const b = swing('b', 2, 0, 600_000);
    const changed = purgeSwingMedia([a, b], 700_000);
    const byId = new Map(changed.map((r) => [r.id, r]));
    expect(byId.get('a')).toMatchObject({ videoPurged: true, framesPurged: true, frames: [] });
    expect(byId.has('b')).toBe(false);
  });
});

describe('enforceHistoryMediaCap', () => {
  it('rewrites the purged records in place and never deletes one', async () => {
    seed(swing('a', 1, 200), swing('b', 2, 200), swing('c', 3, 50));
    const keysBefore = [...store.keys()].sort();

    expect(await enforceHistoryMediaCap(DEFAULT_MEDIA_CAP_MB)).toBe(1);

    expect([...store.keys()].sort()).toEqual(keysBefore);
    const records = await readHistoryRecords();
    expect(records.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(records.map((r) => !!r.videoPurged)).toEqual([false, false, true]);
    const total = records.reduce((s, r) => s + r.videoBlob.size, 0);
    expect(total).toBeLessThanOrEqual(mbToBytes(DEFAULT_MEDIA_CAP_MB));
  });

  it('keeps every record past the old MAX_RECORDS = 10', async () => {
    seed(...Array.from({ length: 15 }, (_, i) => swing(`s${i}`, i + 1, 0, 100)));
    expect(await enforceHistoryMediaCap(DEFAULT_MEDIA_CAP_MB)).toBe(0);
    expect(await readHistoryRecords()).toHaveLength(15);
  });

  it('ignores keys that are not swing records', async () => {
    store.set('swingcheck-other', { foo: 1 });
    seed(swing('a', 1, 1));
    expect(await readHistoryRecords()).toHaveLength(1);
  });
});
