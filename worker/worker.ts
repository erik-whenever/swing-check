const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname.endsWith('/api/log')) {
      return handleLog(request);
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

/**
 * Receives client ERROR logs (POST /api/log) and stores them.
 *
 * For now "storage" is the Worker log stream (visible via `wrangler tail` and the
 * Cloudflare dashboard). TODO: persist to KV/D1/Logpush for durable, queryable logs.
 */
async function handleLog(request: Request): Promise<Response> {
  try {
    const entry = await request.json();
    console.error('[client-log]', JSON.stringify(entry));
  } catch {
    // Ignore malformed bodies — logging must never become a failure source.
  }
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

interface Env {
  ANTHROPIC_API_KEY: string;
}
