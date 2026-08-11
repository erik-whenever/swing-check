// Centralized logging utility.
//
// - In development (import.meta.env.DEV) every level is printed to the console with
//   coloured prefixes; object payloads are expanded inside a collapsed console.group.
// - In production only WARN and ERROR are emitted. ERROR entries are additionally sent
//   to a lightweight remote endpoint (POST /api/log, handled by the Cloudflare Worker).
// - Every entry is also kept in a small in-memory ring buffer that the dev log panel
//   subscribes to, so we can debug on a phone without a laptop attached.
// - When VITE_REMOTE_LOG=true, every entry (any level) is also buffered and batch-posted
//   to POST /log (same Worker) — for the native build, where there is no phone-without-a-
//   laptop fallback at all (no Web Inspector attaches to a headless CI-built WKWebView).
// - window.onerror and unhandledrejection are captured globally and logged the same way.

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

// ── Batched remote sink (blind native debugging — VITE_REMOTE_LOG) ────────────
//
// sendRemote() above only ever ships a single ERROR entry, one request each. That's not
// enough once the iOS build (Ström F) runs headless in CI with no Safari Web Inspector
// attached — every level a session produces needs a way off the device, without turning
// each log line into its own request. This sink buffers every entry that reaches log()
// (so it respects the same DEBUG/WARN cutoff the console and dev panel already use) and
// flushes in batches, on a timer or once full.

const REMOTE_LOG_ENABLED = import.meta.env.VITE_REMOTE_LOG === 'true';
const REMOTE_LOG_FLUSH_MS = 5000;
const REMOTE_LOG_BATCH_SIZE = 50;
const REMOTE_LOG_SESSION_KEY = 'swingcheck-remote-log-session-id';

// Absolute Worker origin + /log — a relative path would resolve against the app's own
// origin (e.g. capacitor://localhost in the native build), not the Worker.
const REMOTE_LOG_ENDPOINT = (() => {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base) return '/log';
  try {
    return new URL('/log', base).toString();
  } catch {
    return '/log';
  }
})();

interface RemoteLogEntry {
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  sessionId: string;
  userAgent: string;
}

let remoteBuffer: RemoteLogEntry[] = [];
let cachedSessionId: string | null = null;

/** Random per app-start, persisted in sessionStorage so a reload mid-session keeps it. */
function getRemoteSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  const fresh = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    cachedSessionId = sessionStorage.getItem(REMOTE_LOG_SESSION_KEY) ?? fresh();
    sessionStorage.setItem(REMOTE_LOG_SESSION_KEY, cachedSessionId);
  } catch {
    cachedSessionId = fresh();
  }
  return cachedSessionId;
}

function flushRemoteLog() {
  if (remoteBuffer.length === 0) return;
  const batch = remoteBuffer;
  remoteBuffer = [];
  try {
    const payload = JSON.stringify({ entries: batch });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(REMOTE_LOG_ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(REMOTE_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        /* never let logging surface its own failure */
      });
    }
  } catch {
    /* swallow — a batch that fails to send is a lost batch, not an app crash */
  }
}

function queueRemoteLog(entry: LogEntry) {
  if (!REMOTE_LOG_ENABLED) return;
  try {
    remoteBuffer.push({
      timestamp: entry.timestamp,
      level: entry.level,
      module: entry.module,
      message: entry.message,
      data: entry.data,
      sessionId: getRemoteSessionId(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    });
    if (remoteBuffer.length >= REMOTE_LOG_BATCH_SIZE) flushRemoteLog();
  } catch {
    /* swallow — logging must never throw */
  }
}

if (REMOTE_LOG_ENABLED) {
  setInterval(flushRemoteLog, REMOTE_LOG_FLUSH_MS);
  // Best-effort: catch the last <5s of logs right before the app backgrounds/closes,
  // often exactly when a native crash leaves nothing else to debug from.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', flushRemoteLog);
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
  queueRemoteLog(entry);
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

// ── Global error capture ───────────────────────────────────────────────────────
// A native build has no dev tools attached, so an uncaught error or rejection that only
// reaches the platform console is invisible. Route both through the same logger (console
// + ring buffer + the remote sink above when enabled) instead of leaving them unrecorded.
const globalErrorLog = createLogger('Global');

function handleWindowError(event: ErrorEvent) {
  globalErrorLog.error('Uncaught error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: serializeError(event.error ?? event.message),
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  globalErrorLog.error('Unhandled promise rejection', serializeError(event.reason));
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
}
