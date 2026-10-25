import { describe, expect, it, vi } from 'vitest';
import { createAppStore, needsBackup, type EnforceMediaCap } from './appStore';
import { serializeHistory, type HistoryEntry } from './historyModel';
import { defaultSettings, serializeSettings } from './settingsModel';
import { createMemoryStore, HISTORY_FILE, SETTINGS_FILE, type TextStore } from './storage';

function entry(id: string, timestamp: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, timestamp, videoUri: `file:///v/${id}.mp4`, frameUris: [], results: [], overallAssessment: '', ...extra };
}

function savedIds(raw: string | undefined): string[] {
  return (JSON.parse(raw as string) as { entries: HistoryEntry[] }).entries.map((e) => e.id);
}

const quiet = () => {};

describe('hydrate', () => {
  it('starts loading and becomes ready with defaults when no files exist', async () => {
    const store = createAppStore({ store: createMemoryStore(), onError: quiet });
    expect(store.getState().status).toBe('loading');
    await store.hydrate();
    expect(store.getState()).toMatchObject({ status: 'ready', settings: defaultSettings(), history: [], persistError: null });
  });

  it('loads saved settings and history (newest first)', async () => {
    const mem = createMemoryStore({
      [SETTINGS_FILE]: serializeSettings({ ...defaultSettings(), language: 'en', mediaCapMb: 500 }),
      [HISTORY_FILE]: serializeHistory([entry('a', 1), entry('b', 2)]),
    });
    const store = createAppStore({ store: mem, onError: quiet });
    await store.hydrate();
    expect(store.getState().settings.language).toBe('en');
    expect(store.getState().history.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('is idempotent', async () => {
    const mem = createMemoryStore();
    const read = vi.spyOn(mem, 'read');
    const store = createAppStore({ store: mem, onError: quiet });
    await Promise.all([store.hydrate(), store.hydrate()]);
    await store.hydrate();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const store = createAppStore({ store: createMemoryStore(), onError: quiet });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.hydrate();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    await store.updateSettings({ language: 'en' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('updateSettings', () => {
  it('validates the patch and persists it', async () => {
    const mem = createMemoryStore();
    const store = createAppStore({ store: mem, onError: quiet });
    await store.updateSettings({ mediaCapMb: 123, language: 'en' });
    await store.flush();
    expect(store.getState().settings.mediaCapMb).toBe(100);
    expect(JSON.parse(mem.files.get(SETTINGS_FILE) as string)).toMatchObject({ language: 'en', mediaCapMb: 100 });
  });

  it('waits for hydration, so an early update lands on top of the loaded file', async () => {
    const mem = createMemoryStore({ [SETTINGS_FILE]: serializeSettings({ ...defaultSettings(), level: 'advanced' }) });
    const store = createAppStore({ store: mem, onError: quiet });
    await store.updateSettings({ language: 'en' });
    expect(store.getState().settings).toMatchObject({ level: 'advanced', language: 'en' });
  });

  it('applies function patches at apply time, so quick toggles do not overwrite each other', async () => {
    const store = createAppStore({ store: createMemoryStore(), onError: quiet });
    await Promise.all([
      store.updateSettings((s) => ({ customRuleIds: [...s.customRuleIds, 'lib-grip'] })),
      store.updateSettings((s) => ({ customRuleIds: [...s.customRuleIds, 'lib-spine-angle'] })),
    ]);
    expect(store.getState().settings.customRuleIds).toEqual(['lib-grip', 'lib-spine-angle']);
  });

  it('skips the write when nothing changed', async () => {
    const mem = createMemoryStore();
    const write = vi.spyOn(mem, 'write');
    const store = createAppStore({ store: mem, onError: quiet });
    await store.updateSettings({ language: defaultSettings().language });
    expect(write).not.toHaveBeenCalled();
  });

  it('enforces a lowered media cap on the history at once', async () => {
    const mem = createMemoryStore({ [HISTORY_FILE]: serializeHistory([entry('a', 1)]) });
    const enforce = vi.fn<EnforceMediaCap>((entries) =>
      entries.map((e) => ({ ...e, videoUri: null, videoPurged: true })),
    );
    const store = createAppStore({ store: mem, enforceMediaCap: enforce, onError: quiet });
    await store.updateSettings({ mediaCapMb: 100 });
    await store.flush();
    expect(enforce).toHaveBeenCalledWith(expect.any(Array), 100);
    expect(store.getState().history[0].videoPurged).toBe(true);
    expect(JSON.parse(mem.files.get(HISTORY_FILE) as string).entries[0].videoPurged).toBe(true);
  });

  it('does not run retention when the cap is raised', async () => {
    const enforce = vi.fn<EnforceMediaCap>((e) => [...e]);
    const store = createAppStore({ store: createMemoryStore(), enforceMediaCap: enforce, onError: quiet });
    await store.updateSettings({ mediaCapMb: 1000 });
    expect(enforce).not.toHaveBeenCalled();
  });
});

describe('addSwing', () => {
  it('adds newest first, replaces by id and persists', async () => {
    const mem = createMemoryStore();
    const store = createAppStore({ store: mem, onError: quiet });
    await store.addSwing(entry('a', 1));
    await store.addSwing(entry('b', 2));
    await store.addSwing(entry('a', 1, { overallAssessment: 'new' }));
    await store.flush();
    expect(store.getState().history.map((e) => e.id)).toEqual(['b', 'a']);
    expect(store.getState().history[1].overallAssessment).toBe('new');
    expect(savedIds(mem.files.get(HISTORY_FILE))).toEqual(['b', 'a']);
  });

  it('runs media retention with the current cap after every save', async () => {
    const enforce = vi.fn<EnforceMediaCap>((e) => [...e]);
    const store = createAppStore({ store: createMemoryStore(), enforceMediaCap: enforce, onError: quiet });
    await store.updateSettings({ mediaCapMb: 1000 });
    await store.addSwing(entry('a', 1));
    expect(enforce).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'a' })], 1000);
  });

  it('keeps the swing when retention throws', async () => {
    const onError = vi.fn();
    const store = createAppStore({
      store: createMemoryStore(),
      enforceMediaCap: () => {
        throw new Error('boom');
      },
      onError,
    });
    await store.addSwing(entry('a', 1));
    expect(store.getState().history).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith('media retention failed', expect.any(Error));
  });
});

describe('data safety', () => {
  it('never overwrites a file it could not read', async () => {
    const mem = createMemoryStore({ [HISTORY_FILE]: serializeHistory([entry('old', 1)]) });
    const failing: TextStore = {
      read: async (name) => {
        if (name === HISTORY_FILE) throw new Error('EIO');
        return mem.read(name);
      },
      write: (n, t) => mem.write(n, t),
    };
    const store = createAppStore({ store: failing, onError: quiet });
    await store.addSwing(entry('new', 2));
    await store.flush();
    expect(store.getState().history.map((e) => e.id)).toEqual(['new']);
    expect(store.getState().persistError).toMatch(/could not read history\.json/);
    expect(savedIds(mem.files.get(HISTORY_FILE))).toEqual(['old']);
  });

  it('backs up a corrupt history once before overwriting it', async () => {
    const mem = createMemoryStore({ [HISTORY_FILE]: '{"entries":[{"id":' });
    let t = 99;
    const store = createAppStore({ store: mem, now: () => t++, onError: quiet });
    await store.hydrate();
    expect(store.getState().history).toEqual([]);
    await Promise.all([store.addSwing(entry('a', 1)), store.addSwing(entry('b', 2))]);
    await store.flush();
    expect(mem.files.get('history.corrupt-99.json')).toBe('{"entries":[{"id":');
    expect(mem.files.has('history.corrupt-100.json')).toBe(false);
    expect(savedIds(mem.files.get(HISTORY_FILE))).toEqual(['b', 'a']);
  });

  it('backs up a history whose rows had to be skipped', async () => {
    const raw = JSON.stringify({ version: 1, entries: [entry('a', 1), { id: 'broken' }] });
    const mem = createMemoryStore({ [HISTORY_FILE]: raw });
    const store = createAppStore({ store: mem, now: () => 5, onError: quiet });
    await store.addSwing(entry('b', 2));
    await store.flush();
    expect(mem.files.get('history.corrupt-5.json')).toBe(raw);
    expect(store.getState().history.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('stops writing a file whose backup failed', async () => {
    const mem = createMemoryStore({ [HISTORY_FILE]: 'not json' });
    const store = createAppStore({
      store: {
        read: (n) => mem.read(n),
        write: async (n, t) => {
          if (n.includes('corrupt')) throw new Error('EACCES');
          await mem.write(n, t);
        },
      },
      onError: quiet,
    });
    await store.addSwing(entry('a', 1));
    await store.addSwing(entry('b', 2));
    expect(mem.files.get(HISTORY_FILE)).toBe('not json');
    expect(store.getState().persistError).toMatch(/could not back up/);
  });

  it('reports a failed save and clears the error on the next success', async () => {
    let fail = true;
    const mem = createMemoryStore();
    const store = createAppStore({
      store: {
        read: (n) => mem.read(n),
        write: async (n, t) => {
          if (fail) throw new Error('disk full');
          await mem.write(n, t);
        },
      },
      onError: quiet,
    });
    await store.addSwing(entry('a', 1));
    expect(store.getState().persistError).toMatch(/could not save history\.json: disk full/);
    fail = false;
    await store.addSwing(entry('b', 2));
    expect(store.getState().persistError).toBeNull();
    expect(savedIds(mem.files.get(HISTORY_FILE))).toEqual(['b', 'a']);
  });
});

describe('needsBackup', () => {
  it('is false for a missing or empty file', () => {
    expect(needsBackup('history', null, 0)).toBe(false);
    expect(needsBackup('settings', '  ', 0)).toBe(false);
  });
  it('flags invalid settings JSON but not field-level fallbacks', () => {
    expect(needsBackup('settings', '{', 0)).toBe(true);
    expect(needsBackup('settings', '{"language":"xx"}', 0)).toBe(false);
  });
  it('flags a history that lost rows in parsing', () => {
    expect(needsBackup('history', '[{},{}]', 2)).toBe(false);
    expect(needsBackup('history', '[{},{}]', 1)).toBe(true);
    expect(needsBackup('history', 'nope', 0)).toBe(true);
  });
});
