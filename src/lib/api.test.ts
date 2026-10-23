import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rule } from '@swingcheck/core/types';
import { analyzeSwing, maxTokensFor, TruncatedResponseError } from './api';

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

afterEach(() => vi.unstubAllGlobals());

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
