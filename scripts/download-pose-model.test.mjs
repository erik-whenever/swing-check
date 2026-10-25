// Tests for the pose-model download (scripts/download-pose-model.mjs, N-7).
//
// What must never happen quietly: the web fetching a different model than the app
// (unversioned URL, or bytes that don't match the shared sha256), or a mismatching
// file being left on disk where the PWA would serve it. Downloads are mocked — no
// network in tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, modelEntry, ensureModel, MODELS_JSON } from './download-pose-model.mjs';

const GOOD = Buffer.from('pretend this is a .task file');
const BAD = Buffer.from('google moved latest');
const entry = {
  file: 'pose_landmarker_lite.task',
  url: 'https://example.test/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  sha256: sha256Hex(GOOD),
};

function mockFetch(bytes, { status = 200 } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Not Found',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  fn.calls = calls;
  return fn;
}

describe('the shared model table (apps/mobile/modules/pose/models.json)', () => {
  const table = JSON.parse(readFileSync(MODELS_JSON, 'utf8'));

  it('pins lite to the versioned float16/1 address and the spike hash', () => {
    const lite = modelEntry(table, 'lite');
    expect(lite.url).toBe(
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    );
    expect(lite.sha256).toBe('59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a');
  });

  it('has a valid full entry too', () => {
    expect(modelEntry(table, 'full').sha256).toMatch(/^5134a3aa.*011b1$/);
  });
});

describe('modelEntry', () => {
  const ok = { lite: { ...entry } };

  it('rejects a latest URL', () => {
    const t = { lite: { ...entry, url: entry.url.replace('/1/', '/latest/') } };
    expect(() => modelEntry(t, 'lite')).toThrow(/latest/);
  });

  it('rejects missing entries, bad hashes, non-https and path-like file names', () => {
    expect(() => modelEntry(ok, 'full')).toThrow(/no entry/);
    expect(() => modelEntry({ lite: { ...entry, sha256: 'abc' } }, 'lite')).toThrow(/sha256/);
    expect(() => modelEntry({ lite: { ...entry, sha256: entry.sha256.toUpperCase() } }, 'lite')).toThrow(/sha256/);
    expect(() => modelEntry({ lite: { ...entry, url: entry.url.replace('https', 'http') } }, 'lite')).toThrow(/https/);
    expect(() => modelEntry({ lite: { ...entry, file: '../x.task' } }, 'lite')).toThrow(/file/);
    expect(() => modelEntry({ lite: { ...entry, file: 'other.task' } }, 'lite')).toThrow(/does not end/);
  });

  it('accepts a well-formed entry', () => {
    expect(modelEntry(ok, 'lite')).toEqual(entry);
  });
});

describe('ensureModel', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pose-model-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('downloads, verifies and writes the model', async () => {
    const f = mockFetch(GOOD);
    expect(await ensureModel({ entry, outDir: dir, fetchImpl: f })).toBe('downloaded');
    expect(f.calls).toEqual([entry.url]);
    expect(await readFile(join(dir, entry.file))).toEqual(GOOD);
    expect(await readdir(dir)).toEqual([entry.file]);
  });

  it('fails on a hash mismatch and leaves nothing behind', async () => {
    await expect(ensureModel({ entry, outDir: dir, fetchImpl: mockFetch(BAD) })).rejects.toThrow(/sha256/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails on an HTTP error and leaves nothing behind', async () => {
    await expect(
      ensureModel({ entry, outDir: dir, fetchImpl: mockFetch(GOOD, { status: 404 }) }),
    ).rejects.toThrow(/HTTP 404/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('keeps a present file with the right hash without fetching', async () => {
    await writeFile(join(dir, entry.file), GOOD);
    const f = mockFetch(BAD);
    expect(await ensureModel({ entry, outDir: dir, fetchImpl: f })).toBe('kept');
    expect(f.calls).toEqual([]);
  });

  it('replaces a present file with the wrong hash', async () => {
    await writeFile(join(dir, entry.file), BAD);
    expect(await ensureModel({ entry, outDir: dir, fetchImpl: mockFetch(GOOD) })).toBe('downloaded');
    expect(await readFile(join(dir, entry.file))).toEqual(GOOD);
  });

  it('removes a stale wrong-hash file when the re-download also mismatches', async () => {
    await writeFile(join(dir, entry.file), BAD);
    await expect(ensureModel({ entry, outDir: dir, fetchImpl: mockFetch(BAD) })).rejects.toThrow(/sha256/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('re-downloads with force even when the hash matches', async () => {
    await writeFile(join(dir, entry.file), GOOD);
    const f = mockFetch(GOOD);
    expect(await ensureModel({ entry, outDir: dir, fetchImpl: f, force: true })).toBe('downloaded');
    expect(f.calls).toHaveLength(1);
  });
});
