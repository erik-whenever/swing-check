import type { Rule, SwingAnalysis } from '../types';
import { SYSTEM_PROMPT, buildSwingPrompt } from './prompt';
import { createLogger } from './logger';

const log = createLogger('API');

const API_URL = import.meta.env.VITE_API_URL || '/api/analyze';

// Priser 2026-08, verifiera vid modellbyte
const CLAUDE_SONNET_4_5_PRICING = {
  inputPerMillionTokens: 3.0,
  outputPerMillionTokens: 15.0,
  cacheWritePerMillionTokens: 3.75,
  cacheReadPerMillionTokens: 0.3,
};

/** Approximate decoded byte size of a base64 string, in KB. */
function base64Kb(b64: string): number {
  return Math.round((b64.length * 0.75) / 1024);
}

export async function analyzeSwing(
  frames: string[],
  rules: Rule[],
  options: { focusRuleId?: string | null; cameraAngle?: string; quickMode?: boolean }
): Promise<SwingAnalysis> {
  const frameSizesKb = frames.map(base64Kb);
  log.info('analyzeSwing request', {
    frames: frames.length,
    rules: rules.length,
    focusRuleId: options.focusRuleId ?? null,
    cameraAngle: options.cameraAngle ?? 'unknown',
    quickMode: !!options.quickMode,
  });
  log.debug('Frame payload sizes (KB)', {
    perFrameKb: frameSizesKb,
    totalKb: frameSizesKb.reduce((a, b) => a + b, 0),
  });

  const prompt = buildSwingPrompt({
    rules,
    focusRuleId: options.focusRuleId,
    frameCount: frames.length,
    cameraAngle: (options.cameraAngle as 'face-on' | 'down-the-line' | 'unknown') || 'unknown',
    quickMode: options.quickMode,
  });

  const imageContent = frames
    .map((b64, i) => [
      { type: 'text' as const, text: `Frame ${i + 1}/${frames.length}:` },
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/jpeg' as const,
          data: b64,
        },
      },
    ])
    .flat();

  const startedAt = performance.now();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      // Prompt caching: the system prompt is static across every request, so we mark it
      // as an ephemeral cache breakpoint to earn cache reads on repeated analyses.
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [
        {
          role: 'user',
          // The rules/instruction block is placed BEFORE the frame images and marked as a
          // cache breakpoint. Caching only covers the prefix up to the breakpoint, so the
          // static rules must precede the per-swing images for the cache to be hit.
          content: [
            { type: 'text' as const, text: prompt, cache_control: { type: 'ephemeral' as const } },
            ...imageContent,
          ],
        },
      ],
    }),
  });
  const responseMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    const errorText = await response.text();
    log.error('analyzeSwing API error', {
      status: response.status,
      responseMs,
      body: errorText.slice(0, 300),
    });
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const cacheReadTokens = data.usage?.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = data.usage?.cache_creation_input_tokens ?? 0;
  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  const costUsd = parseFloat(
    (
      (inputTokens * CLAUDE_SONNET_4_5_PRICING.inputPerMillionTokens +
        outputTokens * CLAUDE_SONNET_4_5_PRICING.outputPerMillionTokens +
        cacheCreationTokens * CLAUDE_SONNET_4_5_PRICING.cacheWritePerMillionTokens +
        cacheReadTokens * CLAUDE_SONNET_4_5_PRICING.cacheReadPerMillionTokens) /
      1_000_000
    ).toFixed(4)
  );

  log.info('analyzeSwing response received', {
    responseMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    costUsd,
    stopReason: data.stop_reason,
  });
  if (cacheReadTokens > 0) {
    log.info(`Cache hit: ${cacheReadTokens} tokens (saved $${(cacheReadTokens * CLAUDE_SONNET_4_5_PRICING.cacheReadPerMillionTokens / 1_000_000).toFixed(4)})`, {
      cacheReadTokens,
      cacheCreationTokens,
    });
  } else if (cacheCreationTokens > 0) {
    log.info(`Cache miss: wrote ${cacheCreationTokens} tokens to cache ($${(cacheCreationTokens * CLAUDE_SONNET_4_5_PRICING.cacheWritePerMillionTokens / 1_000_000).toFixed(4)})`, {
      cacheCreationTokens,
    });
  }

  if (import.meta.env.VITE_DEV_PREVIEW || import.meta.env.VITE_DEBUG_MODE) {
    log.info(`💰 Analysis cost: $${costUsd} (cached: ${cacheReadTokens > 0 ? 'hit' : cacheCreationTokens > 0 ? 'miss' : 'no'})`);
  }

  const text = data.content[0].text;
  const analysis = parseAndValidate(text, rules);

  const allResults = [
    ...(analysis.focus_rule ? [analysis.focus_rule] : []),
    ...analysis.rules,
  ];
  log.info('analyzeSwing parsed', {
    frameQuality: analysis.frame_quality,
    detectedAngle: analysis.camera_angle_detected,
    cannotDetermineCount: allResults.filter((r) => r.verdict === 'cannot_determine').length,
    verdicts: allResults.map((r) => ({
      id: r.id,
      verdict: r.verdict,
      confidence: r.confidence,
    })),
  });

  return analysis;
}

function parseAndValidate(text: string, rules: Rule[]): SwingAnalysis {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

  let parsed: SwingAnalysis;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.error('JSON parse failed', {
      error: err instanceof Error ? err.message : String(err),
      rawSnippet: text.slice(0, 300),
    });
    throw new Error(`Invalid JSON from Claude: ${text.slice(0, 200)}`, { cause: err });
  }

  const returnedIds = new Set(parsed.rules.map((r) => r.id));
  const missingRules = rules
    .filter((r) => !returnedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      verdict: 'cannot_determine' as const,
      confidence: 0,
      relevant_frames: [] as number[],
      visual_evidence: 'Rule was not evaluated in response',
      observation: 'Missing from model response',
    }));

  parsed.rules = [...parsed.rules, ...missingRules].map((r) => ({
    ...r,
    confidence: Math.max(0, Math.min(1, r.confidence)),
  }));

  return parsed;
}
