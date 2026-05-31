const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    // ── Client log endpoint ──────────────────────────────────────────────────
    if (pathname.endsWith('/api/log')) {
      if (request.method === 'POST') return handleLogWrite(request, env);
      if (request.method === 'GET') return handleLogQuery(request, env);
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    // ── Anthropic proxy (default) ────────────────────────────────────────────
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const body = await request.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });
  },
};

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
async function handleLogWrite(request: Request, env: Env): Promise<Response> {
  let entry: ClientLogEntry;
  try {
    entry = (await request.json()) as ClientLogEntry;
  } catch {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Read back stored logs (GET /api/log), newest first.
 * Query params: level, module, since (ms epoch), limit (default 100, max 500).
 * If LOG_READ_KEY is set in the environment, a matching ?key= is required.
 */
async function handleLogQuery(request: Request, env: Env): Promise<Response> {
  if (env.LOG_READ_KEY) {
    const key = new URL(request.url).searchParams.get('key');
    if (key !== env.LOG_READ_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }
  }

  if (!env.DB) {
    return json({ error: 'D1 not configured' }, 501);
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
    return json({ logs: results }, 200);
  } catch (err) {
    return json({ error: 'query failed', detail: String(err) }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
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
  /** D1 binding for persistent client logs (see wrangler.toml [[d1_databases]]). */
  DB?: D1Database;
  /** Optional shared secret guarding GET /api/log reads. */
  LOG_READ_KEY?: string;
}
