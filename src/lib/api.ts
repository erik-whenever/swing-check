import type { Rule, SwingAnalysis } from '../types';
import { SYSTEM_PROMPT, buildSwingPrompt } from './prompt';

const API_URL = import.meta.env.VITE_API_URL || '/api/analyze';

export async function analyzeSwing(
  frames: string[],
  rules: Rule[],
  options: { focusRuleId?: string | null; cameraAngle?: string; quickMode?: boolean }
): Promise<SwingAnalysis> {
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [...imageContent, { type: 'text', text: prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  return parseAndValidate(text, rules);
}

function parseAndValidate(text: string, rules: Rule[]): SwingAnalysis {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();

  let parsed: SwingAnalysis;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Invalid JSON from Claude: ${text.slice(0, 200)}`);
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
