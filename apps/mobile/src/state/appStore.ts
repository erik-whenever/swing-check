// The app's state container (N-3.6): settings + swing history, loaded from and saved to a
// TextStore. Plain TypeScript with a subscribe/getState pair, so React reads it through
// useSyncExternalStore (AppStateProvider) and vitest drives it without React Native.
//
// Data-safety rules, in priority order:
//  1. A file that exists but could not be READ (I/O error) is never overwritten this
//     session — changes stay in memory and persistError says so. Otherwise one bad read
//     would replace the user's whole history with an empty one.
//  2. A file that was read but is not valid JSON, or a history with rows that had to be
//     skipped, is copied to `<name>.corrupt-<ms>.json` before the first overwrite. If the
//     copy fails, rule 1 applies. Nothing is ever deleted.
//  3. Results are never dropped: only enforceMediaCap (media files) runs on the history.

import { DEFAULT_MEDIA_CAP_MB } from '@swingcheck/core/lib/mediaRetention';
import {
  addHistoryEntry,
  parseHistory,
  serializeHistory,
  type HistoryEntry,
} from './historyModel';
import {
  applySettingsPatch,
  defaultSettings,
  parseSettings,
  serializeSettings,
  type AppSettings,
} from './settingsModel';
import {
  backupName,
  createSerialWriter,
  HISTORY_FILE,
  SETTINGS_FILE,
  type SerialWriter,
  type TextStore,
} from './storage';

export type HydrationStatus = 'loading' | 'ready';

export interface AppState {
  status: HydrationStatus;
  settings: AppSettings;
  /** Newest first. */
  history: HistoryEntry[];
  /** Last persistence problem (English, for logs/dev UI), cleared by the next successful save. */
  persistError: string | null;
}

/** Same signature as mediaStore.enforceMediaCap; injected so this file stays expo-free. */
export type EnforceMediaCap = (entries: readonly HistoryEntry[], capMb: number) => HistoryEntry[];

export interface AppStoreDeps {
  store: TextStore;
  /** Defaults to "keep everything" (tests). The provider passes mediaStore.enforceMediaCap. */
  enforceMediaCap?: EnforceMediaCap;
  now?: () => number;
  /** Called on every persistence problem; defaults to console.warn. */
  onError?: (message: string, err: unknown) => void;
}

export interface AppStore {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  /** Load both files. Idempotent: later calls return the first call's promise. */
  hydrate(): Promise<void>;
  /**
   * Validated through applySettingsPatch. Lowering the media cap enforces it at once. Pass
   * a function to derive the patch from the settings at apply time (e.g. a toggle), so
   * quick successive calls never overwrite each other.
   */
  updateSettings(patch: SettingsPatch): Promise<void>;
  /** Add (or replace by id) a swing, then bring media under the cap. */
  addSwing(entry: HistoryEntry): Promise<void>;
  /** Resolves when every queued write has finished (tests, app going to background). */
  flush(): Promise<void>;
}

export type SettingsPatch = Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>);

type FileKey = 'settings' | 'history';

/** How many rows a raw history file holds, before sanitizing; -1 when it is not valid JSON. */
function rawHistoryCount(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') {
      const entries = (parsed as { entries?: unknown }).entries;
      return Array.isArray(entries) ? entries.length : 0;
    }
    return 0;
  } catch {
    return -1;
  }
}

function isJson(raw: string): boolean {
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

/** True when overwriting `raw` would lose something parse did not carry over. */
export function needsBackup(file: FileKey, raw: string | null, parsedCount: number): boolean {
  if (raw === null || raw.trim() === '') return false;
  if (file === 'settings') return !isJson(raw);
  const count = rawHistoryCount(raw);
  return count === -1 || count > parsedCount;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function capOf(settings: AppSettings): number {
  return Number.isFinite(settings.mediaCapMb) ? settings.mediaCapMb : DEFAULT_MEDIA_CAP_MB;
}

export function createAppStore(deps: AppStoreDeps): AppStore {
  const { store } = deps;
  const enforce: EnforceMediaCap = deps.enforceMediaCap ?? ((entries) => [...entries]);
  const now = deps.now ?? Date.now;
  const onError = deps.onError ?? ((msg, err) => console.warn(`[appStore] ${msg}`, String(err)));

  let state: AppState = {
    status: 'loading',
    settings: defaultSettings(),
    history: [],
    persistError: null,
  };
  const listeners = new Set<() => void>();
  const writers: Record<FileKey, SerialWriter> = {
    settings: createSerialWriter(store, SETTINGS_FILE),
    history: createSerialWriter(store, HISTORY_FILE),
  };
  /** false → this file is not written this session (rule 1). */
  const writable: Record<FileKey, boolean> = { settings: true, history: true };
  /** Raw text to copy aside before the first overwrite (rule 2). */
  const pendingBackup: Record<FileKey, string | null> = { settings: null, history: null };
  let hydration: Promise<void> | null = null;

  function setState(patch: Partial<AppState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }

  function report(msg: string, err: unknown) {
    onError(msg, err);
    setState({ persistError: `${msg}: ${message(err)}` });
  }

  async function read(file: FileKey, name: string): Promise<string | null> {
    try {
      return await store.read(name);
    } catch (err) {
      writable[file] = false;
      report(`could not read ${name}; it will not be overwritten this session`, err);
      return null;
    }
  }

  /** Copy the unreadable original aside once; every save waits on the same promise. */
  const backups: Partial<Record<FileKey, Promise<boolean>>> = {};
  function ensureBackup(file: FileKey, name: string): Promise<boolean> {
    const raw = pendingBackup[file];
    if (raw === null) return Promise.resolve(true);
    backups[file] ??= store.write(backupName(name, now()), raw).then(
      () => {
        pendingBackup[file] = null;
        return true;
      },
      (err: unknown) => {
        writable[file] = false;
        report(`could not back up unreadable ${name}; it will not be overwritten this session`, err);
        return false;
      },
    );
    return backups[file];
  }

  async function persist(file: FileKey, text: string): Promise<void> {
    if (!writable[file]) return;
    const name = file === 'settings' ? SETTINGS_FILE : HISTORY_FILE;
    if (!(await ensureBackup(file, name))) return;
    try {
      await writers[file].write(text);
      if (state.persistError !== null) setState({ persistError: null });
    } catch (err) {
      report(`could not save ${name}`, err);
    }
  }

  function enforceSafely(entries: HistoryEntry[], capMb: number): HistoryEntry[] {
    try {
      return enforce(entries, capMb);
    } catch (err) {
      // Media over the cap is better than a lost swing; retried on the next save.
      onError('media retention failed', err);
      return entries;
    }
  }

  function hydrate(): Promise<void> {
    hydration ??= (async () => {
      const [rawSettings, rawHistory] = await Promise.all([
        read('settings', SETTINGS_FILE),
        read('history', HISTORY_FILE),
      ]);
      const settings = parseSettings(rawSettings);
      const history = parseHistory(rawHistory);
      if (needsBackup('settings', rawSettings, 0)) pendingBackup.settings = rawSettings;
      if (needsBackup('history', rawHistory, history.length)) pendingBackup.history = rawHistory;
      setState({ status: 'ready', settings, history });
    })();
    return hydration;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,

    async updateSettings(patch) {
      await hydrate();
      const prev = state.settings;
      const settings = applySettingsPatch(prev, typeof patch === 'function' ? patch(prev) : patch);
      if (serializeSettings(settings) === serializeSettings(prev)) return;
      let history = state.history;
      const capLowered = capOf(settings) < capOf(prev);
      if (capLowered) history = enforceSafely(history, capOf(settings));
      const historyChanged = history !== state.history && serializeHistory(history) !== serializeHistory(state.history);
      setState(historyChanged ? { settings, history } : { settings });
      await Promise.all([
        persist('settings', serializeSettings(settings)),
        historyChanged ? persist('history', serializeHistory(history)) : Promise.resolve(),
      ]);
    },

    async addSwing(entry) {
      await hydrate();
      const added = addHistoryEntry(state.history, entry);
      const history = enforceSafely(added, capOf(state.settings));
      setState({ history });
      await persist('history', serializeHistory(history));
    },

    async flush() {
      if (hydration) await hydration;
      await Promise.all([writers.settings.flush(), writers.history.flush()]);
    },
  };
}
