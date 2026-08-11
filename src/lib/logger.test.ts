// Harness for the batched remote debug sink (Ström F, F-0) and global error capture.
//
// The sink is the native (Capacitor/WKWebView) build's only way to surface a log line —
// no Web Inspector attaches to a headless CI-built app — so what matters is: entries
// buffer instead of firing one request per line, a batch flushes on the size/time
// triggers, the flag defaults to off, and a send failure never throws back into the app.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal browser-global stand-ins; logger.ts guards every one with a typeof check. */
function stubBrowserGlobals() {
  const sessionKv = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => sessionKv.get(k) ?? null,
    setItem: (k: string, v: string) => void sessionKv.set(k, v),
    removeItem: (k: string) => void sessionKv.delete(k),
  });

  const listeners = new Map<string, Array<(event: unknown) => void>>();
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
  });

  vi.stubGlobal('navigator', { userAgent: 'test-agent' });

  return { listeners };
}

function silenceConsole() {
  for (const method of ['debug', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd', 'dir'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
}

async function loadLogger() {
  return await import('./logger');
}

describe('remote debug sink (VITE_REMOTE_LOG)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    stubBrowserGlobals();
    silenceConsole();
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends nothing when VITE_REMOTE_LOG is unset — the required default', async () => {
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    for (let i = 0; i < 60; i++) log.warn('entry', { i });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('buffers entries and sends nothing before the batch fills or the timer fires', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    for (let i = 0; i < 10; i++) log.warn('entry', { i });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flushes as one request once the batch reaches 50 entries', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    for (let i = 0; i < 49; i++) log.warn('entry', { i });
    expect(fetchMock).not.toHaveBeenCalled();

    log.warn('entry 50');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.entries).toHaveLength(50);
  });

  it('flushes on the 5s timer even with a partial batch', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    log.warn('one entry');
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).entries).toHaveLength(1);
  });

  it('starts a fresh buffer after each flush — no resending old entries', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    log.warn('a');
    await vi.advanceTimersByTimeAsync(5000);
    log.warn('b');
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).entries).toHaveLength(1);
  });

  it('tags every entry with timestamp/level/message/sessionId/userAgent', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    log.warn('a');
    log.warn('b');
    await vi.advanceTimersByTimeAsync(5000);

    const entries = JSON.parse(String(fetchMock.mock.calls[0][1].body)).entries;
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toMatchObject({ level: 'WARN', message: expect.any(String), userAgent: 'test-agent' });
      expect(typeof entry.timestamp).toBe('number');
      expect(entry.sessionId).toBeTruthy();
    }
    // Same app-start session → same id on every entry.
    expect(entries[0].sessionId).toBe(entries[1].sessionId);
  });

  it('swallows a send failure silently — logging never throws or rejects into the app', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');

    expect(() => log.warn('will fail to send')).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefers sendBeacon over fetch when available', async () => {
    vi.stubEnv('VITE_REMOTE_LOG', 'true');
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { userAgent: 'test-agent', sendBeacon: beacon });
    const { createLogger } = await loadLogger();
    const log = createLogger('Test');
    log.warn('a');
    await vi.advanceTimersByTimeAsync(5000);

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('global error capture', () => {
  beforeEach(() => {
    vi.resetModules();
    silenceConsole();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes window.onerror and unhandledrejection through the same logger', async () => {
    const { listeners } = stubBrowserGlobals();
    const { getEntries } = await loadLogger();

    const errorHandlers = listeners.get('error') ?? [];
    const rejectionHandlers = listeners.get('unhandledrejection') ?? [];
    expect(errorHandlers).toHaveLength(1);
    expect(rejectionHandlers).toHaveLength(1);

    errorHandlers[0]({ message: 'boom', filename: 'a.ts', lineno: 1, colno: 2, error: new Error('boom') });
    rejectionHandlers[0]({ reason: new Error('rejected') });

    const messages = getEntries().map((e) => e.message);
    expect(messages).toContain('Uncaught error');
    expect(messages).toContain('Unhandled promise rejection');
  });
});
