import type { RuleResult, SwingAnalysis } from '../types';
import type { TtsMode } from '../store/settings';
import { useSettingsStore } from '../store/settings';

// All spoken strings are Swedish; fall back to this locale when no concrete voice
// could be resolved (the selected voice's own lang is preferred otherwise).
const TTS_LANG = 'sv-SE';

// ── Voice selection ───────────────────────────────────────────────────────────
// Web Speech exposes different voices per device, and getVoices() is often empty on
// the first call (notably iOS cold start). We cache voices, refresh on voiceschanged,
// and pick the best available Swedish voice unless the user pinned one in settings.

let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices(): SpeechSynthesisVoice[] {
  const synth = getSynth();
  if (!synth) return cachedVoices;
  const voices = synth.getVoices();
  if (voices.length) cachedVoices = voices;
  return cachedVoices;
}

/** All Swedish voices currently available (lang starts with "sv"). */
export function getSwedishVoices(): SpeechSynthesisVoice[] {
  return refreshVoices().filter((v) => v.lang?.toLowerCase().startsWith('sv'));
}

/**
 * Pick the best voice given an optional pinned voiceURI. Priority:
 * pinned → sv-SE → Siri Swedish → any sv → first available voice.
 */
export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI?: string | null
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const pinned = voices.find((v) => v.voiceURI === preferredURI);
    if (pinned) return pinned;
  }
  const swedish = voices.filter((v) => v.lang?.toLowerCase().startsWith('sv'));
  const svSE = swedish.find((v) => v.lang.toLowerCase() === 'sv-se');
  if (svSE) return svSE;
  const siri = swedish.find((v) => /siri/i.test(v.name));
  if (siri) return siri;
  if (swedish[0]) return swedish[0];
  return voices[0] ?? null;
}

/** The voice that will actually be used for speech, honouring the user's setting. */
export function resolveVoice(): SpeechSynthesisVoice | null {
  const preferred = useSettingsStore.getState().ttsVoiceURI;
  return pickBestVoice(refreshVoices(), preferred);
}

/**
 * Resolve the available voices, retrying for the iOS cold-start case where the first
 * getVoices() returns an empty array. Waits for voiceschanged and retries up to 3 times
 * (500ms apart). Used by the settings UI to populate the voice dropdown.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = getSynth();
  if (!synth) return Promise.resolve([]);
  return new Promise((resolve) => {
    let attempts = 0;
    const settle = () => {
      const voices = refreshVoices();
      if (voices.length) {
        resolve(voices);
        return true;
      }
      return false;
    };
    if (settle()) return;
    const onChanged = () => {
      if (settle()) synth.removeEventListener?.('voiceschanged', onChanged);
    };
    synth.addEventListener?.('voiceschanged', onChanged);
    const retry = () => {
      attempts += 1;
      if (settle() || attempts >= 3) {
        synth.removeEventListener?.('voiceschanged', onChanged);
        if (!cachedVoices.length) resolve([]);
        return;
      }
      setTimeout(retry, 500);
    };
    setTimeout(retry, 500);
  });
}

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

/**
 * Silence everything: the engine AND the serialized session queue. Clearing both
 * is the point — a user pressing stop (or a headset button) means "stop talking",
 * not "stop this sentence and start the next swing's".
 */
export function cancelSpeech(): void {
  clearSpeechQueue();
  getSynth()?.cancel();
}

interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Speak each part as a separate utterance (natural pauses between sentences).
 * Cancels anything currently queued first so new speech always takes over.
 *
 * BARGE-IN by design — this is the single-swing path, where new speech should
 * replace old. For the session path, where two analyses must never talk over each
 * other, use `enqueueSpeech` below.
 */
export function speakSequence(parts: string[], opts: SpeakOptions = {}): void {
  const synth = getSynth();
  if (!synth) {
    // No speech engine: the caller's completion contract must still be honoured,
    // or a queue waiting on onEnd deadlocks on a device without TTS.
    opts.onEnd?.();
    return;
  }

  const filtered = parts.map((p) => p.trim()).filter(Boolean);
  synth.cancel();
  if (filtered.length === 0) {
    opts.onEnd?.();
    return;
  }

  const voice = resolveVoice();
  // `onend` and `onerror` both terminate an utterance, and cancel() fires one or
  // the other depending on the engine. Settle once, whichever arrives.
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    opts.onEnd?.();
  };

  filtered.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || TTS_LANG;
    if (i === 0 && opts.onStart) u.onstart = opts.onStart;
    if (i === filtered.length - 1) {
      u.onend = finish;
      u.onerror = finish;
    }
    synth.speak(u);
  });
}

// ── Serialized speech queue (ADR-003 §5, D-5 pass 3) ─────────────────────────
// In a session, swing N's feedback can finish speaking after swing N+1's analysis
// has already returned. `speakSequence` cancels — which would cut swing N off
// mid-sentence and lose it. So session feedback goes through a FIFO instead: each
// analysis speaks in full, in the order the swings happened.
//
// The queue is a module-level singleton because the speech engine is: there is one
// `window.speechSynthesis`, so there can only be one authority over what it says
// next. `cancelSpeech()` clears the queue as well as the engine — a user who
// silences the app means all of it, not just the current sentence.

interface SpeechJob {
  parts: string[];
  opts: SpeakOptions;
}

let speechQueue: SpeechJob[] = [];
let speechBusy = false;
let speechWatchdog: ReturnType<typeof setTimeout> | null = null;

/**
 * WATCHDOG. iOS Safari drops `onend` often enough that a queue trusting it alone
 * will eventually wedge, silently, for the rest of the session. Budget is generous
 * (speech runs ~12 chars/s; this allows ~10) and only ever fires as a release
 * valve — if it fires the next job simply starts, which is a small overlap rather
 * than permanent silence.
 */
const SPEECH_MS_PER_CHAR = 100;
const SPEECH_WATCHDOG_FLOOR_MS = 5000;
const SPEECH_WATCHDOG_CEILING_MS = 120000;

function watchdogMs(parts: string[]): number {
  const chars = parts.reduce((n, p) => n + p.length, 0);
  return Math.min(
    SPEECH_WATCHDOG_CEILING_MS,
    Math.max(SPEECH_WATCHDOG_FLOOR_MS, chars * SPEECH_MS_PER_CHAR),
  );
}

function clearWatchdog(): void {
  if (speechWatchdog !== null) {
    clearTimeout(speechWatchdog);
    speechWatchdog = null;
  }
}

function pumpSpeech(): void {
  if (speechBusy) return;
  const job = speechQueue.shift();
  if (!job) return;
  speechBusy = true;

  let done = false;
  const advance = () => {
    if (done) return;
    done = true;
    clearWatchdog();
    speechBusy = false;
    job.opts.onEnd?.();
    pumpSpeech();
  };

  speechWatchdog = setTimeout(advance, watchdogMs(job.parts));
  speakSequence(job.parts, { onStart: job.opts.onStart, onEnd: advance });
}

/**
 * Queue a sequence to be spoken after everything already queued. Never interrupts.
 * `onEnd` fires when this job's speech is done (or the watchdog released it).
 */
export function enqueueSpeech(parts: string[], opts: SpeakOptions = {}): void {
  speechQueue.push({ parts, opts });
  pumpSpeech();
}

/** Drop every queued job and release the engine claim. Used by `cancelSpeech`. */
export function clearSpeechQueue(): void {
  clearWatchdog();
  speechQueue = [];
  speechBusy = false;
}

/** Jobs waiting, excluding the one speaking. */
export function pendingSpeechCount(): number {
  return speechQueue.length;
}

/** True while the serialized queue owns the engine. */
export function isSpeechQueueBusy(): boolean {
  return speechBusy;
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
