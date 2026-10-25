import { describe, expect, it } from 'vitest';
import { backupName, createMemoryStore, createSerialWriter, type TextStore } from './storage';

/** A store whose writes resolve only when the test says so. */
function gatedStore() {
  const files = new Map<string, string>();
  const gates: (() => void)[] = [];
  const writes: string[] = [];
  const store: TextStore = {
    async read(name) {
      return files.get(name) ?? null;
    },
    write(name, text) {
      writes.push(text);
      return new Promise<void>((resolve) => {
        gates.push(() => {
          files.set(name, text);
          resolve();
        });
      });
    },
  };
  const release = async () => {
    gates.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { store, files, writes, release };
}

describe('backupName', () => {
  it('puts the timestamp before the extension', () => {
    expect(backupName('history.json', 42)).toBe('history.corrupt-42.json');
    expect(backupName('noext', 7)).toBe('noext.corrupt-7');
  });
});

describe('createMemoryStore', () => {
  it('returns null for a missing file and the text for a written one', async () => {
    const s = createMemoryStore({ a: '1' });
    expect(await s.read('missing')).toBeNull();
    expect(await s.read('a')).toBe('1');
    await s.write('b', '2');
    expect(s.files.get('b')).toBe('2');
  });
});

describe('createSerialWriter', () => {
  it('never runs two writes at once and collapses a burst into the newest text', async () => {
    const { store, files, writes, release } = gatedStore();
    const w = createSerialWriter(store, 'f');
    const p1 = w.write('1');
    const p2 = w.write('2');
    const p3 = w.write('3');
    expect(writes).toEqual(['1']);
    await release();
    expect(writes).toEqual(['1', '3']);
    await release();
    await Promise.all([p1, p2, p3]);
    expect(files.get('f')).toBe('3');
    expect(writes).toEqual(['1', '3']);
  });

  it('rejects the callers of a failed write and keeps working afterwards', async () => {
    let fail = true;
    const files = new Map<string, string>();
    const store: TextStore = {
      async read() {
        return null;
      },
      async write(name, text) {
        if (fail) throw new Error('disk full');
        files.set(name, text);
      },
    };
    const w = createSerialWriter(store, 'f');
    await expect(w.write('x')).rejects.toThrow('disk full');
    fail = false;
    await w.write('y');
    expect(files.get('f')).toBe('y');
  });

  it('flush waits for queued writes', async () => {
    const { store, files, release } = gatedStore();
    const w = createSerialWriter(store, 'f');
    void w.write('a');
    void w.write('b');
    let flushed = false;
    const f = w.flush().then(() => (flushed = true));
    await release();
    expect(flushed).toBe(false);
    await release();
    await f;
    expect(files.get('f')).toBe('b');
  });
});
