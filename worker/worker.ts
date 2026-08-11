// SwingCheck API Worker
//
// Two responsibilities: proxy the Anthropic Messages API (so ANTHROPIC_API_KEY never
// reaches the client) and receive client ERROR logs on /api/log (stored in D1).
//
// The proxy is deliberately NOT a general-purpose passthrough. The Worker URL ships in
// the PWA bundle in cleartext, so anything the proxy forwards unchecked is something a
// stranger can spend Erik's API budget on (ARCHITECTURE_REVIEW_2026-07.md → R2).
// Four layers guard it, cheapest first:
//   1. Origin allowlist (ALLOWED_ORIGINS) — including preflight.
//   2. Body size ceiling (BODY_MAX_BYTES) — checked before JSON.parse.
//   3. Server-side pinning of `model` and the `max_tokens` ceiling.
//   4. A daily call cap counted in D1 (DAILY_CALL_CAP).
// Layer 4 fails OPEN by design: a D1 outage must never take the swing loop down.

// ── Defaults (every one overridable via env; see worker/wrangler.toml) ────────────
/** Must match the model src/lib/api.ts is written and priced against. */
const DEFAULT_MODEL_ID = 'claude-sonnet-4-5';
/** Ceiling, not a fixed value — see pinRequestBody(). Matches MAX_TOKENS_DETAILED in api.ts. */
const DEFAULT_MAX_TOKENS = 2000;
/** ~20 frames of base64 JPEG plus prompt; a real analysis lands far below this. */
const DEFAULT_BODY_MAX_BYTES = 30 * 1024 * 1024;
const DEFAULT_DAILY_CALL_CAP = 300;
/**
 * Used only when ALLOWED_ORIGINS is unset, so that a fresh clone works with `npm run dev`
 * without configuration. Production origins are NOT guessed: deploying without setting
 * ALLOWED_ORIGINS gives 403 for the real app, which is the intended fail-closed direction.
 */
const DEV_FALLBACK_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

const CORS_METHOD_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const originAllowed = isOriginAllowed(origin, env);
    // Vary: Origin on every response — the allow-origin value now depends on the request,
    // so a shared cache must not reuse one origin's response for another.
    const cors = corsHeaders(originAllowed ? origin : null);

    const { pathname } = new URL(request.url);
    const isLogEndpoint = pathname.endsWith('/api/log');

    // Preflight follows the same rule as the real request: an origin that is not on the
    // list never gets an Access-Control-Allow-Origin header back.
    if (request.method === 'OPTIONS') {
      if (!originAllowed) return forbiddenOrigin(origin);
      return new Response(null, { status: 204, headers: cors });
    }

    // A browser sends Origin on every cross-origin request and on every non-GET request.
    // The one legitimate caller without an Origin is a terminal reading logs back
    // (GET /api/log), which has its own guard in LOG_READ_KEY — so only that path is
    // exempt. Everything else, Origin missing included, must be on the list.
    const originExempt = isLogEndpoint && request.method === 'GET' && origin === null;
    if (!originAllowed && !originExempt) {
      console.warn('[origin] rejected', JSON.stringify({ origin, pathname, method: request.method }));
      return forbiddenOrigin(origin);
    }

    // ── Client log endpoint ──────────────────────────────────────────────────
    if (isLogEndpoint) {
      if (request.method === 'POST') return handleLogWrite(request, env, cors);
      if (request.method === 'GET') return handleLogQuery(request, env, cors);
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    // ── Anthropic proxy (default) ────────────────────────────────────────────
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    return handleProxy(request, env, cors);
  },
};

// ── Origin allowlist ───────────────────────────────────────────────────────────

/** ALLOWED_ORIGINS is comma-separated; trailing slashes are tolerated. */
function allowedOrigins(env: Env): string[] {
  const configured = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (configured.length > 0) return configured;
  console.warn('[origin] ALLOWED_ORIGINS is unset — falling back to localhost dev origins only');
  return DEV_FALLBACK_ORIGINS;
}

function isOriginAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin.replace(/\/+$/, ''));
}

function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin', ...CORS_METHOD_HEADERS };
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

function forbiddenOrigin(origin: string | null): Response {
  return new Response(
    JSON.stringify({
      error: 'origin_not_allowed',
      message: `Origin ${origin ?? '(none)'} is not allowed. Add it to ALLOWED_ORIGINS on the Worker.`,
    }),
    // No Access-Control-Allow-Origin: the browser must see this as a CORS failure too.
    { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } },
  );
}

// ── Anthropic proxy ────────────────────────────────────────────────────────────

async function handleProxy(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const maxBytes = positiveIntEnv(env.BODY_MAX_BYTES, DEFAULT_BODY_MAX_BYTES);

  // Content-Length first (free), then the actual byte count — a chunked body can omit
  // the header. Both checks land before JSON.parse, which is the expensive part.
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return tooLarge(declaredLength, maxBytes, cors);
  }

  const raw = await request.arrayBuffer();
  if (raw.byteLength > maxBytes) return tooLarge(raw.byteLength, maxBytes, cors);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: 'invalid_json' }, 400, cors);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'invalid_body', message: 'Expected a JSON object.' }, 400, cors);
  }

  const cap = positiveIntEnv(env.DAILY_CALL_CAP, DEFAULT_DAILY_CALL_CAP);
  const usage = await countCall(env);
  if (usage !== null && usage > cap) {
    console.warn('[cap] daily call cap reached', JSON.stringify({ calls: usage, cap }));
    return json(
      {
        error: 'daily_cap_reached',
        message: `Dagligt anropstak nått (${usage}/${cap} anrop, UTC-dygn). Höj DAILY_CALL_CAP på Workern eller vänta till midnatt UTC.`,
      },
      429,
      cors,
    );
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(pinRequestBody(body as Record<string, unknown>, env)),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

/**
 * Replace the client's model/token settings with the server's.
 *
 * `system`, `messages` and every `cache_control` breakpoint inside them are passed through
 * BYTE-FOR-BYTE: prompt caching keys on the exact prefix, so touching them would silently
 * turn every analysis into a cache write (see api.ts → cache_read_input_tokens).
 *
 * `max_tokens` is clamped rather than overwritten — a deviation from the W-1 spec, and a
 * deliberate one. api.ts sends 600 in quick mode and 2000 in detailed mode; overwriting
 * both with one value would erase quick mode's ceiling, i.e. change app behaviour in the
 * name of hardening. MAX_TOKENS is therefore the ceiling nobody can exceed, and a client
 * asking for less still gets less. An absent or nonsensical value gets the ceiling.
 */
function pinRequestBody(body: Record<string, unknown>, env: Env): Record<string, unknown> {
  const ceiling = positiveIntEnv(env.MAX_TOKENS, DEFAULT_MAX_TOKENS);
  const requested = Number(body.max_tokens);
  const maxTokens =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), ceiling) : ceiling;

  return {
    ...body,
    model: env.MODEL_ID?.trim() || DEFAULT_MODEL_ID,
    max_tokens: maxTokens,
  };
}

function tooLarge(bytes: number, maxBytes: number, cors: Record<string, string>): Response {
  console.warn('[size] body rejected', JSON.stringify({ bytes, maxBytes }));
  return json(
    {
      error: 'payload_too_large',
      message: `Request body ${bytes} bytes exceeds the ${maxBytes} byte limit (BODY_MAX_BYTES).`,
    },
    413,
    cors,
  );
}

/**
 * Increment today's (UTC) call counter and return the new total.
 *
 * Returns null when the count is unavailable — no DB binding, or the write failed. The
 * caller then lets the request through: the cap protects the wallet, but it must never
 * become the single point of failure that stops G1 from analysing a swing.
 */
async function countCall(env: Env): Promise<number | null> {
  if (!env.DB) {
    console.warn('[cap] no D1 binding — daily call cap not enforced');
    return null;
  }
  const day = new Date().toISOString().slice(0, 10);
  try {
    const { results } = await env.DB.prepare(
      `INSERT INTO api_usage (day, calls) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET calls = calls + 1
         RETURNING calls`,
    )
      .bind(day)
      .all<{ calls: number }>();
    const calls = results?.[0]?.calls;
    return typeof calls === 'number' ? calls : null;
  } catch (err) {
    console.warn('[cap] usage count failed — letting the request through', String(err));
    return null;
  }
}

function positiveIntEnv(raw: string | number | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ── Client logs ────────────────────────────────────────────────────────────────

interface ClientLogEntry {
  timestamp?: number;
  level?: string;
  module?: string;
  message?: string;
  data?: unknown;
  userAgent?: string;
  url?: string;
}

/**
 * Persist a client ERROR log (POST /api/log) to D1.
 * Falls back to the Worker log stream if the D1 binding is missing or the write fails,
 * so a logging problem never becomes a request failure.
 */
async function handleLogWrite(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  let entry: ClientLogEntry;
  try {
    entry = (await request.json()) as ClientLogEntry;
  } catch {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO client_logs
           (timestamp, received_at, level, module, message, data, user_agent, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
          Date.now(),
          String(entry.level ?? 'ERROR'),
          String(entry.module ?? 'unknown'),
          String(entry.message ?? ''),
          entry.data !== undefined ? JSON.stringify(entry.data) : null,
          entry.userAgent ?? null,
          entry.url ?? null,
        )
        .run();
    } else {
      console.error('[client-log] (no D1 binding)', JSON.stringify(entry));
    }
  } catch (err) {
    console.error('[client-log] store failed', String(err), JSON.stringify(entry));
  }

  return new Response(null, { status: 204, headers: cors });
}

/**
 * Read back stored logs (GET /api/log), newest first.
 * Query params: level, module, since (ms epoch), limit (default 100, max 500).
 * If LOG_READ_KEY is set in the environment, a matching ?key= is required.
 */
async function handleLogQuery(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  if (env.LOG_READ_KEY) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== env.LOG_READ_KEY) {
      return json({ error: 'unauthorized' }, 401, cors);
    }
  }

  if (!env.DB) {
    return json({ error: 'D1 not configured' }, 501, cors);
  }

  const params = new URL(request.url).searchParams;
  const level = params.get('level');
  const module = params.get('module');
  const since = Number(params.get('since'));
  const limit = Math.min(Math.max(Number(params.get('limit')) || 100, 1), 500);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (level) {
    where.push('level = ?');
    binds.push(level);
  }
  if (module) {
    where.push('module = ?');
    binds.push(module);
  }
  if (Number.isFinite(since) && since > 0) {
    where.push('received_at >= ?');
    binds.push(since);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, timestamp, received_at, level, module, message, data, user_agent, url
         FROM client_logs ${whereSql}
         ORDER BY received_at DESC
         LIMIT ?`,
    )
      .bind(...binds, limit)
      .all();
    return json({ logs: results }, 200, cors);
  } catch (err) {
    return json({ error: 'query failed', detail: String(err) }, 500, cors);
  }
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ── Minimal D1 typings (the worker is bundled by Wrangler, not the app tsc build,
//    so we avoid pulling in @cloudflare/workers-types just for these). ──────────
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  ANTHROPIC_API_KEY: string;
  /** D1 binding for persistent client logs + the daily call counter (wrangler.toml). */
  DB?: D1Database;
  /** Optional shared secret guarding GET /api/log reads. */
  LOG_READ_KEY?: string;
  /** Comma-separated origin allowlist. Unset → localhost dev origins only. */
  ALLOWED_ORIGINS?: string;
  /** Model the proxy pins every request to, ignoring the client's `model`. */
  MODEL_ID?: string;
  /** Upper bound on `max_tokens`; the client may ask for less, never more. */
  MAX_TOKENS?: string;
  /** Request bodies above this many bytes are rejected with 413. */
  BODY_MAX_BYTES?: string;
  /** Proxy calls allowed per UTC day before 429. */
  DAILY_CALL_CAP?: string;
}
