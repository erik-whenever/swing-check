// Acceptance tests for the proxy hardening (W-1, ARCHITECTURE_REVIEW_2026-07.md → R2).
//
// The Worker has no imports, so it runs straight under vitest with a stubbed global
// fetch and a fake D1 binding. Everything here is offline: no Anthropic call is ever
// made, the upstream request is captured and inspected instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';

const ORIGIN = 'https://swingcheck.example';

interface InstallRow {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

const emptyRow = (): InstallRow => ({
  calls: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
});

/** Minimal in-memory stand-in for the D1 binding the Worker uses. */
function fakeDb(state: { calls: number; fail?: boolean; install?: Map<string, InstallRow> }) {
  const install = (state.install ??= new Map());
  return {
    prepare(query: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind: (...values: unknown[]) => {
          binds = values;
          return stmt;
        },
        async run() {
          if (state.fail) throw new Error('D1 down');
          if (query.includes('INSERT INTO install_usage')) {
            const [id, day, inTok, outTok, cacheRead, cacheWrite] = binds as [
              string, string, number, number, number, number,
            ];
            const row = install.get(`${id}|${day}`) ?? emptyRow();
            row.calls += 1;
            row.input_tokens += inTok;
            row.output_tokens += outTok;
            row.cache_read_tokens += cacheRead;
            row.cache_write_tokens += cacheWrite;
            install.set(`${id}|${day}`, row);
          }
          return { results: [], success: true };
        },
        async first() {
          if (state.fail) throw new Error('D1 down');
          const row = install.get(`${binds[0]}|${binds[1]}`);
          return row ? { calls: row.calls, tokens: row.input_tokens + row.output_tokens } : null;
        },
        async all() {
          if (state.fail) throw new Error('D1 down');
          if (query.includes('api_usage')) {
            state.calls += 1;
            return { results: [{ calls: state.calls }], success: true };
          }
          return { results: [], success: true };
        },
      };
      return stmt;
    },
  };
}

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ANTHROPIC_API_KEY: 'test-key',
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    MODEL_ID: 'claude-sonnet-4-5',
    MAX_TOKENS: '2000',
    DAILY_CALL_CAP: '300',
    DB: fakeDb({ calls: 0 }),
    ...overrides,
  };
}

/** The body api.ts sends, trimmed to the parts that must survive untouched. */
function analysisBody(extra: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'RULES', cache_control: { type: 'ephemeral' } },
          { type: 'text', text: 'Frame 1/1:' },
        ],
      },
    ],
    ...extra,
  };
}

function proxyRequest(body: unknown, origin: string | null = ORIGIN, installId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (installId !== undefined) headers['X-SwingCheck-Install'] = installId;
  return new Request('https://api.example/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Captures the request the Worker makes to Anthropic and answers with a canned reply. */
let upstream: { url: string; body: Record<string, unknown> } | null;
/** `usage` block the canned reply carries; undefined → no usage in the reply. */
let upstreamUsage: Record<string, number> | undefined;
let upstreamStatus: number;

beforeEach(() => {
  upstream = null;
  upstreamUsage = undefined;
  upstreamStatus = 200;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    upstream = { url: String(url), body: JSON.parse(String(init.body)) };
    const model = (JSON.parse(String(init.body)) as { model: string }).model;
    return new Response(JSON.stringify(upstreamUsage ? { model, usage: upstreamUsage } : { model }), {
      status: upstreamStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('origin allowlist', () => {
  it('rejects an origin that is not on the list with 403 and no allow-origin header', async () => {
    const res = await worker.fetch(proxyRequest(analysisBody(), 'https://evil.example'), baseEnv() as never);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(upstream).toBeNull();
  });

  it('echoes an allowed origin back and sets Vary: Origin', async () => {
    const res = await worker.fetch(proxyRequest(analysisBody()), baseEnv() as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('applies the same rule to preflight', async () => {
    const allowed = await worker.fetch(
      new Request('https://api.example/api/analyze', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      baseEnv() as never,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const denied = await worker.fetch(
      new Request('https://api.example/api/analyze', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
      baseEnv() as never,
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects a proxy call with no Origin header at all', async () => {
    const res = await worker.fetch(proxyRequest(analysisBody(), null), baseEnv() as never);
    expect(res.status).toBe(403);
  });

  it('guards POST /api/log by origin too', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/api/log', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'ERROR', message: 'x' }),
      }),
      baseEnv() as never,
    );
    expect(res.status).toBe(403);
  });

  it('still allows a headless GET /api/log read (guarded by LOG_READ_KEY, not by origin)', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/api/log?key=secret', { method: 'GET' }),
      baseEnv({ LOG_READ_KEY: 'secret' }) as never,
    );
    expect(res.status).toBe(200);

    const wrongKey = await worker.fetch(
      new Request('https://api.example/api/log?key=nope', { method: 'GET' }),
      baseEnv({ LOG_READ_KEY: 'secret' }) as never,
    );
    expect(wrongKey.status).toBe(401);
  });
});

describe('server-side pinning', () => {
  it('ignores the client model and uses MODEL_ID', async () => {
    const res = await worker.fetch(
      proxyRequest(analysisBody({ model: 'claude-opus-4-8' })),
      baseEnv() as never,
    );
    expect(upstream?.body.model).toBe('claude-sonnet-4-5');
    await expect(res.json()).resolves.toEqual({ model: 'claude-sonnet-4-5' });
  });

  it('caps max_tokens at MAX_TOKENS but lets quick mode ask for less', async () => {
    await worker.fetch(proxyRequest(analysisBody({ max_tokens: 999999 })), baseEnv() as never);
    expect(upstream?.body.max_tokens).toBe(2000);

    await worker.fetch(proxyRequest(analysisBody({ max_tokens: 600 })), baseEnv() as never);
    expect(upstream?.body.max_tokens).toBe(600);

    await worker.fetch(proxyRequest(analysisBody({ max_tokens: 'nonsense' })), baseEnv() as never);
    expect(upstream?.body.max_tokens).toBe(2000);
  });

  it('passes system/messages and every cache_control breakpoint through byte-for-byte', async () => {
    const body = analysisBody();
    await worker.fetch(proxyRequest(body), baseEnv() as never);
    // Prompt caching keys on the exact prefix: any rewrite here turns every analysis into
    // a cache write (cache_read_input_tokens would drop to 0).
    expect(upstream?.body.system).toEqual(body.system);
    expect(upstream?.body.messages).toEqual(body.messages);
  });
});

describe('body size ceiling', () => {
  it('rejects a body above BODY_MAX_BYTES with 413 before parsing it', async () => {
    const res = await worker.fetch(
      proxyRequest(analysisBody({ padding: 'x'.repeat(5000) })),
      baseEnv({ BODY_MAX_BYTES: '1000' }) as never,
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('payload_too_large');
    expect(upstream).toBeNull();
  });

  it('rejects unparseable JSON with 400', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/api/analyze', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: '{not json',
      }),
      baseEnv() as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('daily call cap', () => {
  it('returns 429 once the cap is passed, without calling Anthropic', async () => {
    const env = baseEnv({ DAILY_CALL_CAP: '2', DB: fakeDb({ calls: 0 }) });
    expect((await worker.fetch(proxyRequest(analysisBody()), env as never)).status).toBe(200);
    expect((await worker.fetch(proxyRequest(analysisBody()), env as never)).status).toBe(200);

    upstream = null;
    const third = await worker.fetch(proxyRequest(analysisBody()), env as never);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe('daily_cap_reached');
    expect(upstream).toBeNull();
  });

  it('lets calls through when the D1 binding is missing (cap is never a single point of failure)', async () => {
    const env = { ...baseEnv(), DB: undefined };
    const res = await worker.fetch(proxyRequest(analysisBody()), env as never);
    expect(res.status).toBe(200);
    expect(upstream).not.toBeNull();
  });

  it('lets calls through when the D1 write fails', async () => {
    const env = baseEnv({ DAILY_CALL_CAP: '1', DB: fakeDb({ calls: 0, fail: true }) });
    const res = await worker.fetch(proxyRequest(analysisBody()), env as never);
    expect(res.status).toBe(200);
  });
});

describe('POST /log (batched remote debug sink)', () => {
  function logRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://api.example/log', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  function entryBatch(sessionId: string, count = 1) {
    return {
      entries: Array.from({ length: count }, (_, i) => ({
        timestamp: 1000 + i,
        level: 'WARN',
        module: 'Test',
        message: `entry ${i}`,
        sessionId,
        userAgent: 'test-agent',
      })),
    };
  }

  it('accepts a batch, prints each entry with console.log, and never touches D1', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await worker.fetch(logRequest(entryBatch('s1', 3)), baseEnv() as never);
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(3);
    expect(String(logSpy.mock.calls[0][0])).toContain('[remote]');
  });

  it('is guarded by the origin allowlist like every other route', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/log', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify(entryBatch('s1')),
      }),
      baseEnv() as never,
    );
    expect(res.status).toBe(403);
  });

  it('rejects a body over 100KB with 413', async () => {
    const res = await worker.fetch(
      logRequest(entryBatch('s1'), { 'Content-Length': String(200 * 1024) }),
      baseEnv() as never,
    );
    expect(res.status).toBe(413);
  });

  it('rejects unparseable JSON gracefully with 204 (never crashes)', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/log', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: '{not json',
      }),
      baseEnv() as never,
    );
    expect(res.status).toBe(204);
  });

  it('rate-limits a single sessionId past 60 requests/min with 429', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = baseEnv() as never;
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) {
      last = await worker.fetch(logRequest(entryBatch('flood-session')), env);
    }
    expect(last?.status).toBe(429);
  });

  it('does not rate-limit a different sessionId', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = baseEnv() as never;
    for (let i = 0; i < 60; i++) {
      await worker.fetch(logRequest(entryBatch('session-a')), env);
    }
    const res = await worker.fetch(logRequest(entryBatch('session-b')), env);
    expect(res.status).toBe(204);
  });
});

describe('per-installation cap (W-2)', () => {
  const INSTALL = '3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b';
  const OTHER = '00000000-0000-4000-8000-000000000000';
  const USAGE = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 8000,
    cache_creation_input_tokens: 200,
  };
  const today = () => new Date().toISOString().slice(0, 10);

  function envWith(install: Map<string, InstallRow>, overrides: Record<string, unknown> = {}) {
    return baseEnv({ DB: fakeDb({ calls: 0, install }), ...overrides });
  }

  const call = (env: unknown, installId?: string, origin: string | null = ORIGIN) =>
    worker.fetch(proxyRequest(analysisBody(), origin, installId), env as never);

  it('records usage per installation and day with the right sums', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    const env = envWith(install);
    await call(env, INSTALL);
    await call(env, INSTALL);
    expect(install.get(`${INSTALL}|${today()}`)).toEqual({
      calls: 2,
      input_tokens: 2000,
      output_tokens: 1000,
      cache_read_tokens: 16000,
      cache_write_tokens: 400,
    });
  });

  it('normalises an upper-case install id to the same bucket', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    await call(envWith(install), INSTALL.toUpperCase());
    expect([...install.keys()]).toEqual([`${INSTALL}|${today()}`]);
  });

  it('puts a missing header in the anon bucket', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    await call(envWith(install));
    expect([...install.keys()]).toEqual([`anon|${today()}`]);
  });

  it('puts an invalid header in the anon bucket', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    const env = envWith(install);
    await call(env, 'not-a-uuid');
    // v1 UUID: right shape, wrong version — must not count as an install id.
    await call(env, '3f2b8c1e-9a4d-1e7f-8b6a-1c2d3e4f5a6b');
    expect([...install.keys()]).toEqual([`anon|${today()}`]);
    expect(install.get(`anon|${today()}`)?.calls).toBe(2);
  });

  it('returns 429 install_cap_reached once the call cap is reached, without calling Anthropic', async () => {
    upstreamUsage = USAGE;
    const env = envWith(new Map(), { INSTALL_DAILY_CALL_CAP: '2' });
    expect((await call(env, INSTALL)).status).toBe(200);
    expect((await call(env, INSTALL)).status).toBe(200);

    upstream = null;
    const third = await call(env, INSTALL);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe('install_cap_reached');
    expect(third.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(upstream).toBeNull();

    // Another installation is not affected.
    expect((await call(env, OTHER)).status).toBe(200);
  });

  it('defaults to 40 calls per installation', async () => {
    const install = new Map<string, InstallRow>();
    install.set(`${INSTALL}|${today()}`, { ...emptyRow(), calls: 39 });
    const env = envWith(install, { INSTALL_DAILY_CALL_CAP: undefined });
    upstreamUsage = USAGE;
    expect((await call(env, INSTALL)).status).toBe(200);
    expect((await call(env, INSTALL)).status).toBe(429);
  });

  it('returns 429 once the token cap (input + output, cache excluded) is reached', async () => {
    upstreamUsage = USAGE; // 1500 in+out per call
    const env = envWith(new Map(), { INSTALL_DAILY_TOKEN_CAP: '3000' });
    expect((await call(env, INSTALL)).status).toBe(200);
    expect((await call(env, INSTALL)).status).toBe(200);
    const third = await call(env, INSTALL);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe('install_cap_reached');
  });

  it('keeps the web (anon) on the global cap by default, not the per-install caps', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    install.set(`anon|${today()}`, { ...emptyRow(), calls: 40, input_tokens: 10_000_000 });
    expect((await call(envWith(install))).status).toBe(200);
  });

  it('honours ANON_DAILY_CALL_CAP and ANON_DAILY_TOKEN_CAP when set', async () => {
    const byCalls = new Map<string, InstallRow>();
    byCalls.set(`anon|${today()}`, { ...emptyRow(), calls: 5 });
    expect((await call(envWith(byCalls, { ANON_DAILY_CALL_CAP: '5' }))).status).toBe(429);

    const byTokens = new Map<string, InstallRow>();
    byTokens.set(`anon|${today()}`, { ...emptyRow(), calls: 1, output_tokens: 1000 });
    expect((await call(envWith(byTokens, { ANON_DAILY_TOKEN_CAP: '1000' }))).status).toBe(429);
  });

  it('counts the global cap first, so rotating install ids cannot get past it', async () => {
    upstreamUsage = USAGE;
    const env = baseEnv({ DAILY_CALL_CAP: '1', DB: fakeDb({ calls: 0 }) });
    await call(env, INSTALL);
    const res = await call(env, OTHER);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('daily_cap_reached');
  });

  it('lets calls through when the D1 binding is missing', async () => {
    upstreamUsage = USAGE;
    const res = await call({ ...baseEnv(), DB: undefined }, INSTALL);
    expect(res.status).toBe(200);
    expect(upstream).not.toBeNull();
  });

  it('lets calls through when D1 reads and writes fail', async () => {
    upstreamUsage = USAGE;
    const env = baseEnv({ INSTALL_DAILY_CALL_CAP: '1', DB: fakeDb({ calls: 0, fail: true }) });
    expect((await call(env, INSTALL)).status).toBe(200);
    expect((await call(env, INSTALL)).status).toBe(200);
  });

  it('does not count an upstream error and passes it through', async () => {
    upstreamStatus = 529;
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    const res = await call(envWith(install), INSTALL);
    expect(res.status).toBe(529);
    expect(install.size).toBe(0);
  });

  it('returns the upstream answer unchanged after buffering it', async () => {
    upstreamUsage = USAGE;
    const res = await call(baseEnv(), INSTALL);
    await expect(res.json()).resolves.toEqual({ model: 'claude-sonnet-4-5', usage: USAGE });
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('hands the usage write to ctx.waitUntil when an ExecutionContext is given', async () => {
    upstreamUsage = USAGE;
    const install = new Map<string, InstallRow>();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
    const res = await worker.fetch(
      proxyRequest(analysisBody(), ORIGIN, INSTALL),
      envWith(install) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(install.get(`${INSTALL}|${today()}`)?.calls).toBe(1);
  });

  it('allows X-SwingCheck-Install in preflight, Content-Type kept', async () => {
    const res = await worker.fetch(
      new Request('https://api.example/api/analyze', {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-swingcheck-install',
        },
      }),
      baseEnv() as never,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-SwingCheck-Install');
  });

  it('accepts the native app origin when it is on the list', async () => {
    const env = baseEnv({ ALLOWED_ORIGINS: `${ORIGIN},swingcheck://se.swingcheck.app` });
    const res = await call(env, INSTALL, 'swingcheck://se.swingcheck.app');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('swingcheck://se.swingcheck.app');
  });
});

describe('wrangler.toml (deploy config)', () => {
  it('binds D1 as DB, allows the native app origin and sets the W-2 caps', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
    // worker.ts reads env.DB; any other binding name makes every D1 feature fail open.
    expect(toml).toMatch(/^binding\s*=\s*"DB"\s*$/m);
    const origins = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(toml)?.[1].split(',') ?? [];
    expect(origins).toContain('swingcheck://se.swingcheck.app');
    expect(origins).toContain('https://swing-check-henna.vercel.app/');
    expect(toml).toMatch(/^INSTALL_DAILY_CALL_CAP\s*=\s*"40"\s*$/m);
    expect(toml).toMatch(/^INSTALL_DAILY_TOKEN_CAP\s*=\s*"400000"\s*$/m);
  });
});
