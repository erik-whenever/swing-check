import { describe, it, expect } from 'vitest';
import { buildSwingPrompt, buildFrameCountNote, buildLanguageNote, SYSTEM_PROMPT } from './prompt';
import type { Rule } from '../types';

function rule(partial: Partial<Rule> = {}): Rule {
  return {
    id: 'hands-at-top',
    title: 'Händerna i toppen',
    description: 'Händerna ska vara över höger axel i toppen.',
    phase: 'top',
    weight: 2,
    active: true,
    ...partial,
  };
}

const RULES: Rule[] = [
  rule(),
  rule({ id: 'hip-slide', title: 'Höftglid', phase: 'downswing' }),
  rule({
    id: 'head-still',
    title: 'Stilla huvud',
    phase: 'backswing',
    drills: [{ title: 'Väggdrill', description: 'Stå med huvudet mot väggen.' }],
  }),
];

// The cached prompt prefix must be byte-identical across swings, otherwise every
// analysis pays full input price. Frame selection dedupes, so frameCount drifts
// between swings of the same session — it must not reach the cached text.
describe('buildSwingPrompt cache stability', () => {
  it('is identical for the same rules and angle regardless of frameCount', () => {
    const base = { rules: RULES, cameraAngle: 'face-on' as const };

    const at16 = buildSwingPrompt({ ...base, frameCount: 16 });
    const at19 = buildSwingPrompt({ ...base, frameCount: 19 });
    const omitted = buildSwingPrompt(base);

    expect(at19).toBe(at16);
    expect(omitted).toBe(at16);
  });

  it('is identical regardless of frameCount with a focus rule and in quick mode', () => {
    const base = {
      rules: RULES,
      focusRuleId: 'head-still',
      cameraAngle: 'down-the-line' as const,
      quickMode: true,
    };

    expect(buildSwingPrompt({ ...base, frameCount: 19 })).toBe(
      buildSwingPrompt({ ...base, frameCount: 16 })
    );
  });

  it('contains no digit that came from the frame count', () => {
    // Whatever numbers survive in the prompt (schema examples, confidence bands) must be
    // the same ones at any frame count — this catches a count leaking in as bare text.
    const digitsAt16 = buildSwingPrompt({ rules: RULES, frameCount: 16 }).match(/\d+/g);
    const digitsAt19 = buildSwingPrompt({ rules: RULES, frameCount: 19 }).match(/\d+/g);

    expect(digitsAt19).toEqual(digitsAt16);
  });

  it('still varies when the rules or the camera angle change', () => {
    const faceOn = buildSwingPrompt({ rules: RULES, cameraAngle: 'face-on' });

    expect(buildSwingPrompt({ rules: RULES, cameraAngle: 'down-the-line' })).not.toBe(faceOn);
    expect(buildSwingPrompt({ rules: RULES.slice(0, 2), cameraAngle: 'face-on' })).not.toBe(faceOn);
  });
});

describe('buildFrameCountNote', () => {
  it('carries the exact count for the post-breakpoint block', () => {
    expect(buildFrameCountNote(17)).toContain('17');
    expect(buildFrameCountNote(17)).not.toBe(buildFrameCountNote(18));
  });
});

// N-3.5: the response language is a parameter, and the cached prefix (system prompt +
// rules block) must not depend on it — otherwise every language pays its own cache writes.
describe('language independence of the cached prefix', () => {
  it('names no response language in the system prompt or the rules block', () => {
    for (const quickMode of [true, false]) {
      const prompt = buildSwingPrompt({ rules: RULES, focusRuleId: 'head-still', quickMode });
      for (const text of [SYSTEM_PROMPT, prompt]) {
        // "English" does occur: JSON keys and enum values stay in English in every language.
        expect(text).not.toMatch(/Swedish|svensk/i);
      }
    }
  });

  it('puts the language and its examples in the post-breakpoint note', () => {
    expect(buildLanguageNote('sv')).toContain('Swedish');
    expect(buildLanguageNote('sv')).toContain('Händerna för lågt i toppen');
    expect(buildLanguageNote('en')).toContain('English');
    expect(buildLanguageNote('en')).not.toBe(buildLanguageNote('sv'));
  });
});
