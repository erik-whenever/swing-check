// Web shell of the logger — the parts that need a browser or a Vite build.
//
// The logger itself (levels, console, ring buffer, createLogger) is platform-free and
// lives in @swingcheck/core. This module injects the web build's environment into it
// and registers the browser transports, once, when it is first imported (main.tsx
// imports it first):
// - In production, ERROR entries are additionally sent to a lightweight remote endpoint
//   (POST /api/log, handled by the Cloudflare Worker).
// - When VITE_REMOTE_LOG=true, every entry (any level) is also buffered and batch-posted
//   to POST /log (same Worker) — for the native build, where there is no phone-without-a-
//   laptop fallback at all (no Web Inspector attaches to a headless CI-built WKWebView).
// - window.onerror and unhandledrejection are captured globally and logged the same way.
//
// Web code keeps importing from here; the core's API is re-exported unchanged.

import {
  addLogSink,
  configureLogger,
  createLogger,
  serializeError,
  type LogEntry,
  type LogLevel,
} from '@swingcheck/core/lib/logger';

export {
  createLogger,
  getEntries,
  serializeError,
  subscribe,
  type LogEntry,
  type LogLevel,
  type Logger,
} from '@swingcheck/core/lib/logger';

const isDev = import.meta.env.DEV;

configureLogger({
  isDev,
  version: import.meta.env.VITE_APP_VERSION || 'dev',
  platform: 'web',
});

const LOG_ENDPOINT = import.meta.env.VITE_LOG_URL || '/api/log';

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

// ── Registration ─────────────────────────────────────────────────────────────
// Same order as before the split: the single production ERROR request, then the batch.
addLogSink((entry) => {
  if (!isDev && entry.level === 'ERROR') sendRemote(entry);
  queueRemoteLog(entry);
});

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
