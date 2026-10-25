import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rule } from '../types';
import {
  analyzeSwing,
  ApiNotConfiguredError,
  configureApi,
  isApiConfigured,
  maxTokensFor,
  parseUsageCapError,
  TruncatedResponseError,
  UsageCapReachedError,
} from './api';
import { setAnalysisLanguage, DEFAULT_ANALYSIS_LANGUAGE } from './language';

const rule = (i: number): Rule => ({
  id: `r${i}`,
  title: `Rule ${i}`,
  description: 'check',
  phase: 'address',
  weight: 1,
  active: true,
});

function mockResponse(stop_reason: string, text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          stop_reason,
          content: [{ type: 'text', text }],
          usage: { input_tokens: 10, output_tokens: 600 },
        }),
        { status: 200 },
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  configureApi({ url: '/api/analyze', headers: {} });
  setAnalysisLanguage(DEFAULT_ANALYSIS_LANGUAGE);
});

function sentBody() {
  return JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
}

describe('maxTokensFor', () => {
  it('grows with the rule count and keeps quick below detailed', () => {
    // 7 DTL rules: the case that was cut off at 600 / 2000 (S-48).
    expect(maxTokensFor(true, 7)).toBeGreaterThan(900);
    expect(maxTokensFor(false, 7)).toBeGreaterThan(2000);
    expect(maxTokensFor(true, 7)).toBeLessThan(maxTokensFor(false, 7));
    expect(maxTokensFor(true, 8)).toBeGreaterThan(maxTokensFor(true, 7));
  });

  it('never exceeds the Worker ceiling', () => {
    expect(maxTokensFor(false, 50)).toBe(4096);
  });
});

describe('analyzeSwing on a truncated answer', () => {
  it('throws TruncatedResponseError instead of an invalid-JSON error, after reporting usage', async () => {
    mockResponse('max_tokens', '{"rules": [{"id": "r1", "verd');
    const onUsage = vi.fn();
    const err = await analyzeSwing(['x'], [rule(1), rule(2)], { quickMode: true, onUsage }).catch((e) => e);
    expect(err).toBeInstanceOf(TruncatedResponseError);
    expect(err.message).toMatch(/max_tokens/);
    expect(err.ruleCount).toBe(2);
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it('sends the scaled ceiling', async () => {
    mockResponse('end_turn', '{"rules": []}');
    await analyzeSwing(['x'], [rule(1), rule(2), rule(3)], { quickMode: true });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(maxTokensFor(true, 3));
  });
});

describe('analyzeSwing language', () => {
  // Everything up to and including the last cache_control block is the cached prefix.
  function cachedPrefix(body: { system: unknown; messages: { content: { cache_control?: unknown }[] }[] }) {
    const content = body.messages[0].content;
    const lastCached = content.map((c) => !!c.cache_control).lastIndexOf(true);
    return JSON.stringify({ system: body.system, prefix: content.slice(0, lastCached + 1) });
  }

  it('keeps the cached prefix byte-identical across languages and sends the language after it', async () => {
    mockResponse('end_turn', '{"rules": []}');
    await analyzeSwing(['x'], [rule(1)], { quickMode: true, language: 'sv' });
    const sv = sentBody();
    vi.unstubAllGlobals();
    mockResponse('end_turn', '{"rules": []}');
    await analyzeSwing(['x'], [rule(1)], { quickMode: true, language: 'en' });
    const en = sentBody();

    expect(cachedPrefix(en)).toBe(cachedPrefix(sv));
    const after = (b: typeof sv) => JSON.stringify(b.messages[0].content.slice(1));
    expect(after(sv)).toContain('RESPONSE LANGUAGE: Swedish');
    expect(after(en)).toContain('RESPONSE LANGUAGE: English');
  });

  it('defaults to the app-wide language', async () => {
    setAnalysisLanguage('en');
    mockResponse('end_turn', '{"rules": []}');
    await analyzeSwing(['x'], [rule(1)], {});
    expect(JSON.stringify(sentBody().messages)).toContain('RESPONSE LANGUAGE: English');
  });
});

describe('analyzeSwing configuration', () => {
  it('throws before any request when no endpoint is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    configureApi({ url: '' });
    expect(isApiConfigured()).toBe(false);
    await expect(analyzeSwing(['x'], [rule(1)], {})).rejects.toBeInstanceOf(ApiNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards configured headers (the native Origin) and keeps the JSON content type', async () => {
    configureApi({ url: 'https://worker.example/api/analyze', headers: { Origin: 'swingcheck://app' } });
    mockResponse('end_turn', '{"rules": []}');
    await analyzeSwing(['x'], [rule(1)], {});
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://worker.example/api/analyze');
    expect(init.headers).toEqual({ Origin: 'swingcheck://app', 'Content-Type': 'application/json' });
  });
});

describe('usage caps (W-2)', () => {
  function mock429(body: string) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 429 })));
  }

  it('throws UsageCapReachedError with the Worker message for install_cap_reached', async () => {
    mock429(JSON.stringify({ error: 'install_cap_reached', message: 'Slut för idag.' }));
    const err = await analyzeSwing(['x'], [rule(1)], {}).catch((e) => e);
    expect(err).toBeInstanceOf(UsageCapReachedError);
    expect(err.scope).toBe('install');
    expect(err.message).toBe('Slut för idag.');
  });

  it('maps daily_cap_reached to scope daily and falls back to a default message', () => {
    const err = parseUsageCapError(429, JSON.stringify({ error: 'daily_cap_reached' }));
    expect(err?.scope).toBe('daily');
    expect(err?.message).toMatch(/midnatt UTC/);
  });

  it('leaves other errors as generic API errors', async () => {
    expect(parseUsageCapError(429, 'not json')).toBeNull();
    expect(parseUsageCapError(500, JSON.stringify({ error: 'install_cap_reached' }))).toBeNull();
    expect(parseUsageCapError(429, JSON.stringify({ error: 'rate_limited' }))).toBeNull();
    mock429('nope');
    const err = await analyzeSwing(['x'], [rule(1)], {}).catch((e) => e);
    expect(err).not.toBeInstanceOf(UsageCapReachedError);
    expect(err.message).toMatch(/API error 429/);
  });
});
