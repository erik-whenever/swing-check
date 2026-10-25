// Pure script builder (N-3.6 part 8): analysis result + language → the ordered utterances
// to speak. No expo, no engine — unit-tested from the repo root's vitest.
//
// Two variants over the same result:
//   'live' — the hands-free session (G1, earbuds): intro + short verdicts only. Mirrors the
//            web's quick mode (src/lib/tts.ts buildSpeechParts 'quick').
//   'full' — the result screen's "Läs upp": intro, overall assessment, each failed rule's
//            observation and drill, then what could not be judged. Mirrors the web's
//            detailed mode, plus the overall assessment.
//
// The language is a parameter (core lib/language.ts) — the same value the prompt was built
// with, so the model's words and the fixed phrases here never mix languages.
//
// OSÄKER: the web's phrase logic lives in src/lib/tts.ts, coupled to its zustand stores and
// Swedish-only, so it cannot be imported here. This is a deliberate, language-parameterised
// mirror of it. Risk: medium — the two can drift. Candidate to move into packages/core once
// the web is made language-aware (it would then import this, not the other way round).

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import type { RuleResult, SwingAnalysis } from '@swingcheck/core/types';

export type ScriptVariant = 'live' | 'full';

export type UtteranceKind =
  | 'intro'
  | 'overall'
  | 'verdict'
  | 'observation'
  | 'drill'
  | 'undetermined-header'
  | 'undetermined'
  | 'no-issues'
  | 'status';

export interface Utterance {
  kind: UtteranceKind;
  text: string;
}

export interface ScriptOptions {
  variant: ScriptVariant;
  language: AnalysisLanguage;
  /** Hands-free session: the intro names the swing ("Sving 3 klart."). */
  swingNumber?: number;
  /** The user's focus rule; with an analysis.focus_rule only that rule is read. */
  focusRuleId?: string | null;
  /** Rule title lookup for naming unjudged rules; falls back to the model's short verdict. */
  ruleTitle?: (id: string) => string | undefined;
}

interface Phrases {
  intro: string;
  swingDone: (n: number) => string;
  noIssues: string;
  undetermined: string;
  analyzing: string;
  failed: string;
  sessionNext: string;
}

// Swedish strings are word for word the web's (src/lib/tts.ts) — consistency across shells.
export const PHRASES: Record<AnalysisLanguage, Phrases> = {
  sv: {
    intro: 'Sving analyserat.',
    swingDone: (n) => `Sving ${n} klart.`,
    noIssues: 'Inga fel hittades.',
    undetermined: 'Kunde inte bedömas:',
    analyzing: 'Analyserar...',
    failed: 'Analysen misslyckades, försök igen',
    sessionNext: 'Startar nästa sving om tre sekunder.',
  },
  en: {
    intro: 'Swing analysed.',
    swingDone: (n) => `Swing ${n} done.`,
    noIssues: 'No faults found.',
    undetermined: 'Could not be judged:',
    analyzing: 'Analysing...',
    failed: 'The analysis failed, try again',
    sessionNext: 'Starting the next swing in three seconds.',
  },
};

/** First sentence of a paragraph — the fallback when a short_verdict is missing. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

function shortVerdict(r: RuleResult): string {
  const short = r.short_verdict?.trim();
  if (short) return short;
  // observation is a full paragraph; reading it out loud is not a short variant.
  return firstSentence(r.observation ?? '');
}

function drillText(r: RuleResult): string {
  return (r.drill_suggestion || r.suggestion || '').trim();
}

/** The parts of an analysis the script reads — a stored HistoryEntry can supply these. */
export type SpeechSource = Pick<SwingAnalysis, 'rules' | 'focus_rule' | 'overall_assessment'>;

/** Build the ordered utterances for one analysis. Empty texts are never emitted. */
export function buildSpeechScript(analysis: SpeechSource, opts: ScriptOptions): Utterance[] {
  const p = PHRASES[opts.language];
  const out: Utterance[] = [];
  const push = (kind: UtteranceKind, text: string | undefined) => {
    const t = text?.trim();
    if (t) out.push({ kind, text: t });
  };

  push('intro', opts.swingNumber ? p.swingDone(opts.swingNumber) : p.intro);
  const focusMode = !!opts.focusRuleId && !!analysis.focus_rule;

  if (opts.variant === 'live') {
    const rules = focusMode ? [analysis.focus_rule!] : analysis.rules;
    for (const r of rules) push('verdict', shortVerdict(r));
    return out;
  }

  push('overall', analysis.overall_assessment);

  const results = focusMode
    ? [analysis.focus_rule!]
    : [...(analysis.focus_rule ? [analysis.focus_rule] : []), ...analysis.rules];
  const failed = results.filter((r) => r.verdict === 'fail');
  // Unjudged rules are not a clean bill of health — "no faults" would be misleading.
  const undetermined = results.filter((r) => r.verdict === 'cannot_determine');

  if (failed.length === 0 && undetermined.length === 0) {
    push('no-issues', p.noIssues);
    return out;
  }

  for (const r of failed) {
    // The lean quick-mode schema omits observation; the short verdict then names the fault.
    push('observation', r.observation?.trim() || r.short_verdict);
    push('drill', drillText(r));
  }

  if (undetermined.length > 0) {
    push('undetermined-header', p.undetermined);
    for (const r of undetermined) {
      push('undetermined', opts.ruleTitle?.(r.id)?.trim() || shortVerdict(r));
    }
  }
  return out;
}

/** A single fixed phrase as an utterance (status lines: analysing, failed, next swing). */
export function phraseUtterance(
  language: AnalysisLanguage,
  key: 'analyzing' | 'failed' | 'sessionNext',
): Utterance {
  return { kind: 'status', text: PHRASES[language][key] };
}
