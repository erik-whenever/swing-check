// The persistence seam for the app state (N-3.6). The store only ever sees this small
// interface, so it is unit-tested from the repo root's vitest with the in-memory version
// below; fileStore.ts is the expo-file-system implementation. No expo imports here.

export interface TextStore {
  /** The file's text, or null when it does not exist. Throws on a real I/O error. */
  read(name: string): Promise<string | null>;
  /** Replace the file's text. Implementations should make the replace atomic. */
  write(name: string, text: string): Promise<void>;
}

export const SETTINGS_FILE = 'settings.json';
export const HISTORY_FILE = 'history.json';

/** Where an unreadable file is copied before it is overwritten: `history.corrupt-<ms>.json`. */
export function backupName(file: string, now: number): string {
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  return `${base}.corrupt-${now}${ext}`;
}

export interface MemoryStore extends TextStore {
  files: Map<string, string>;
}

/** In-memory TextStore for tests (and as a fallback should the file system be unavailable). */
export function createMemoryStore(initial: Record<string, string> = {}): MemoryStore {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(name) {
      return files.has(name) ? (files.get(name) as string) : null;
    },
    async write(name, text) {
      files.set(name, text);
    },
  };
}

export interface SerialWriter {
  /** Queue the latest text; resolves when it (or a newer text) is on disk. Rejects on failure. */
  write(text: string): Promise<void>;
  /** Resolves when nothing is queued or in flight. Never rejects. */
  flush(): Promise<void>;
}

/**
 * One writer per file: never two writes to the same file at once, and writes queued
 * while one is in flight collapse into the newest text, so the last state always wins and
 * a burst of changes costs at most two writes.
 */
export function createSerialWriter(store: TextStore, name: string): SerialWriter {
  let inFlight: Promise<void> | null = null;
  let pending: string | null = null;
  let waiters: { resolve: () => void; reject: (err: unknown) => void }[] = [];

  function pump(): Promise<void> {
    const text = pending as string;
    const batch = waiters;
    pending = null;
    waiters = [];
    inFlight = store.write(name, text).then(
      () => batch.forEach((w) => w.resolve()),
      (err: unknown) => batch.forEach((w) => w.reject(err)),
    );
    return inFlight.then(() => {
      inFlight = null;
      if (pending !== null) void pump();
    });
  }

  return {
    write(text) {
      pending = text;
      const done = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
      if (!inFlight) void pump();
      return done;
    },
    async flush() {
      while (inFlight) await inFlight;
    },
  };
}
