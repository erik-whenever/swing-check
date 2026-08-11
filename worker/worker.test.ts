// Acceptance tests for the proxy hardening (W-1, ARCHITECTURE_REVIEW_2026-07.md → R2).
//
// The Worker has no imports, so it runs straight under vitest with a stubbed global
// fetch and a fake D1 binding. Everything here is offline: no Anthropic call is ever
// made, the upstream request is captured and inspected instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker';

const ORIGIN = 'https://swingcheck.example';

/** Minimal in-memory stand-in for the D1 binding the Worker uses. */
function fakeDb(state: { calls: number; fail?: boolean }) {
  return {
    prepare(query: string) {
      const stmt = {
        bind: () => stmt,
        async run() {
          if (state.fail) throw new Error('D1 down');
          return { results: [], success: true };
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

function proxyRequest(body: unknown, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request('https://api.example/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Captures the request the Worker makes to Anthropic and answers with a canned reply. */
let upstream: { url: string; body: Record<string, unknown> } | null;

beforeEach(() => {
  upstream = null;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    upstream = { url: String(url), body: JSON.parse(String(init.body)) };
    return new Response(
      JSON.stringify({ model: (JSON.parse(String(init.body)) as { model: string }).model }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
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
