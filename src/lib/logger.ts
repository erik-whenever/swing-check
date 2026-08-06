// Centralized logging utility.
//
// - In development (import.meta.env.DEV) every level is printed to the console with
//   coloured prefixes; object payloads are expanded inside a collapsed console.group.
// - In production only WARN and ERROR are emitted. ERROR entries are additionally sent
//   to a lightweight remote endpoint (POST /api/log, handled by the Cloudflare Worker).
// - Every entry is also kept in a small in-memory ring buffer that the dev log panel
//   subscribes to, so we can debug on a phone without a laptop attached.

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

/**
 * Turn an unknown thrown value into something readable in a log payload.
 *
 * `String(err)` collapses a DOM `Event` (what a failed WASM/model fetch or a
 * MediaPipe load error throws) into the useless `"[object Event]"`. Here we pull
 * out the diagnostic bits that actually matter — the event type and the failing
 * resource URL/status on its target — so the next failure is diagnosable.
 */
export function serializeError(err: unknown): Record<string, unknown> | string {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }

  if (typeof Event !== 'undefined' && err instanceof Event) {
    const out: Record<string, unknown> = { kind: 'Event', type: err.type };
    const target = err.target as
      | (Partial<{ src: string; href: string; readyState: number; status: number }> & EventTarget)
      | null;
    if (target) {
      if (typeof target.src === 'string') out.targetUrl = target.src;
      else if (typeof target.href === 'string') out.targetUrl = target.href;
      if (typeof target.status === 'number') out.status = target.status;
      if (typeof target.readyState === 'number') out.readyState = target.readyState;
      out.targetType = (target as object).constructor?.name;
    }
    return out;
  }

  if (err && typeof err === 'object') {
    // Prefer a real JSON view; fall back to String() if it isn't serializable.
    try {
      return JSON.parse(JSON.stringify(err));
    } catch {
      return String(err);
    }
  }

  return String(err);
}

const isDev = import.meta.env.DEV;

// Production drops everything below WARN; development keeps everything.
const MIN_LEVEL: LogLevel = isDev ? 'DEBUG' : 'WARN';

const LOG_ENDPOINT = import.meta.env.VITE_LOG_URL || '/api/log';

// ── In-memory ring buffer (powers the dev log panel) ──────────────────────────
const BUFFER_SIZE = 50;
const buffer: LogEntry[] = [];
let nextId = 1;

type Listener = (entries: LogEntry[]) => void;
const listeners = new Set<Listener>();

/** Snapshot of the buffered entries, oldest first. */
export function getEntries(): LogEntry[] {
  return buffer.slice();
}

/** Subscribe to buffer changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function pushEntry(entry: LogEntry) {
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  const snapshot = getEntries();
  for (const listener of listeners) listener(snapshot);
}

// ── Console formatting ────────────────────────────────────────────────────────
const LEVEL_STYLE: Record<LogLevel, string> = {
  DEBUG: 'color:#94a3b8',
  INFO: 'color:#38bdf8',
  WARN: 'color:#fbbf24;font-weight:bold',
  ERROR: 'color:#f87171;font-weight:bold',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function consoleMethod(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'ERROR':
      return console.error;
    case 'WARN':
      return console.warn;
    case 'INFO':
      return console.info;
    default:
      return console.debug;
  }
}

function emitConsole(entry: LogEntry) {
  const { level, module, message, data, timestamp } = entry;
  const method = consoleMethod(level);
  const hasData = data !== undefined;
  const isComplex = hasData && typeof data === 'object' && data !== null;

  if (isDev) {
    const prefix = `%c${formatTime(timestamp)} ${level} [${module}]`;
    const style = LEVEL_STYLE[level];
    // Expand object payloads inside a collapsed group so the log stays scannable.
    if (isComplex) {
      console.groupCollapsed(prefix, style, message);
      console.dir(data);
      console.groupEnd();
    } else if (hasData) {
      method(prefix, style, message, data);
    } else {
      method(prefix, style, message);
    }
    return;
  }

  // Production: plain, unstyled output (no %c — terminals/CI don't render it).
  const prefix = `${formatTime(timestamp)} ${level} [${module}]`;
  if (hasData) method(prefix, message, data);
  else method(prefix, message);
}

// ── Remote transport (production ERROR only) ──────────────────────────────────
function sendRemote(entry: LogEntry) {
  // TODO: this is fire-and-forget. Move to a batched/queued transport with retry
  // and sampling before relying on it for high-volume production diagnostics.
  try {
    const payload = JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      module: entry.module,
      message: entry.message,
      data: entry.data,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof location !== 'undefined' ? location.href : undefined,
    });

    // sendBeacon survives page unloads and avoids blocking; fall back to fetch.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(LOG_ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        /* never let logging surface its own failure */
      });
    }
  } catch {
    /* logging must never throw */
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────
function log(level: LogLevel, module: string, message: string, data?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const entry: LogEntry = {
    id: nextId++,
    timestamp: Date.now(),
    level,
    module,
    message,
    data,
  };

  pushEntry(entry);
  emitConsole(entry);

  if (!isDev && level === 'ERROR') sendRemote(entry);
}

/**
 * Create a named logger for a module/component.
 * @example const log = createLogger('FrameExtractor');
 */
export function createLogger(module: string): Logger {
  return {
    debug: (message, data) => log('DEBUG', module, message, data),
    info: (message, data) => log('INFO', module, message, data),
    warn: (message, data) => log('WARN', module, message, data),
    error: (message, data) => log('ERROR', module, message, data),
  };
}
