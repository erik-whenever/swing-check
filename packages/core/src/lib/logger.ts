// Centralized logging utility — the platform-free core.
//
// - In development every level is printed to the console with coloured prefixes; object
//   payloads are expanded inside a collapsed console.group.
// - In production only WARN and ERROR are emitted.
// - Every entry is also kept in a small in-memory ring buffer that the dev log panel
//   subscribes to, so we can debug on a phone without a laptop attached.
//
// Nothing here reads a build environment or touches a platform global. The shell that
// runs the code (web today: src/lib/logger.ts) injects the environment with
// `configureLogger` and adds its transports with `addLogSink` once, at startup — the
// remote endpoints, `navigator.sendBeacon`, `window.onerror` all live there. Until it
// does, the core behaves as a production build with no sinks: WARN and up, console only.

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

// ── Injected environment + sinks ──────────────────────────────────────────────
export interface LoggerEnvironment {
  /** Development build: every level, styled console. Production: WARN and up, plain. */
  isDev: boolean;
  /** Build identity (`<package version>+<git sha>` on web). Carried for sinks. */
  version: string;
  /** The shell running the code: 'web' today, the native platforms under F6. */
  platform: string;
}

/** A transport for entries that passed the level cutoff. Must never throw. */
export type LogSink = (entry: LogEntry, env: Readonly<LoggerEnvironment>) => void;

let environment: LoggerEnvironment = { isDev: false, version: 'dev', platform: 'unknown' };
const sinks: LogSink[] = [];

/** Set by the platform shell at startup, before anything logs. */
export function configureLogger(next: Partial<LoggerEnvironment>): void {
  environment = { ...environment, ...next };
}

export function getLoggerEnvironment(): Readonly<LoggerEnvironment> {
  return environment;
}

/** Register a transport. Returns a function that removes it again. */
export function addLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

// Production drops everything below WARN; development keeps everything.
function minLevel(): LogLevel {
  return environment.isDev ? 'DEBUG' : 'WARN';
}

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

  if (environment.isDev) {
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

// ── Core ──────────────────────────────────────────────────────────────────────
function log(level: LogLevel, module: string, message: string, data?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

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

  for (const sink of sinks) sink(entry, environment);
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
