import type { RuleResult, SwingAnalysis } from '../types';
import type { TtsMode } from '../store/settings';

// All spoken strings are Swedish; use a Swedish voice/locale so the device's
// default Swedish voice is selected (we don't pin a specific named voice).
const TTS_LANG = 'sv-SE';

export const TTS_INTRO = 'Sving analyserat.';
export const TTS_ANALYZING = 'Analyserar...';
export const TTS_FAILED = 'Analysen misslyckades, försök igen';
const TTS_NO_ISSUES = 'Inga fel hittades.';
/** Spoken at the end of a session swing to signal the upcoming auto-restart (3s). */
export const TTS_SESSION_NEXT = 'Startar nästa sving om tre sekunder.';

function getSynth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export function isSpeaking(): boolean {
  const synth = getSynth();
  return !!synth && (synth.speaking || synth.pending);
}

export function cancelSpeech(): void {
  getSynth()?.cancel();
}

interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Speak each part as a separate utterance (natural pauses between sentences).
 * Cancels anything currently queued first so new speech always takes over.
 */
export function speakSequence(parts: string[], opts: SpeakOptions = {}): void {
  const synth = getSynth();
  if (!synth) return;

  const filtered = parts.map((p) => p.trim()).filter(Boolean);
  synth.cancel();
  if (filtered.length === 0) {
    opts.onEnd?.();
    return;
  }

  filtered.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = TTS_LANG;
    if (i === 0 && opts.onStart) u.onstart = opts.onStart;
    if (i === filtered.length - 1) {
      u.onend = () => opts.onEnd?.();
    }
    synth.speak(u);
  });
}

/** Speak a single short phrase, replacing any current speech. */
export function speak(text: string, opts: SpeakOptions = {}): void {
  speakSequence([text], opts);
}

function shortVerdict(r: RuleResult): string {
  return (r.short_verdict || r.observation || '').trim();
}

function drillText(r: RuleResult): string {
  return (r.drill_suggestion || r.suggestion || '').trim();
}

/**
 * Build the ordered list of phrases to speak for an analysis result.
 * Always starts with the intro, then results per the selected mode.
 */
export function buildSpeechParts(
  analysis: SwingAnalysis,
  mode: TtsMode,
  focusRuleId?: string | null,
  opts: { swingNumber?: number } = {}
): string[] {
  const focusMode = !!focusRuleId && !!analysis.focus_rule;
  // In session mode the intro announces which swing just finished, e.g. "Sving 3 klart."
  const intro = opts.swingNumber ? `Sving ${opts.swingNumber} klart.` : TTS_INTRO;
  const parts: string[] = [intro];

  if (mode === 'quick') {
    if (focusMode) {
      // Only read the verdict for the active focus rule.
      parts.push(shortVerdict(analysis.focus_rule!));
    } else {
      // A short verdict per rule.
      for (const r of analysis.rules) parts.push(shortVerdict(r));
    }
    return parts;
  }

  // Detailed mode: full observation for each failed rule, then its drill.
  const results = focusMode
    ? [analysis.focus_rule!]
    : [
        ...(analysis.focus_rule ? [analysis.focus_rule] : []),
        ...analysis.rules,
      ];
  const failed = results.filter((r) => r.verdict === 'fail');

  if (failed.length === 0) {
    parts.push(TTS_NO_ISSUES);
    return parts;
  }

  for (const r of failed) {
    if (r.observation) parts.push(r.observation.trim());
    const drill = drillText(r);
    if (drill) parts.push(drill);
  }
  return parts;
}
