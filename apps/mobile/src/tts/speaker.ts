// The engine seam (N-3.6 part 8). Everything above this — script builder, queue, screens,
// live session — talks to `Speaker`; only an adapter knows which engine actually speaks.
//
// TODO(N-3.6 TTS-motor): add `expo-speech` and an `expoSpeechSpeaker()` adapter here, then
// make `createDefaultSpeaker()` return it. Not done yet on purpose: a new native dependency
// in parallel with the navigation work collides in apps/mobile/package-lock.json.
// See docs/native/tts.md → "Koppla in expo-speech".

import { ttsConfigFor, type AnalysisLanguage } from '@swingcheck/core/lib/language';

export interface SpeakRequest {
  text: string;
  language: AnalysisLanguage;
  /** BCP-47 locale from core's language profile (ttsConfigFor) — expo-speech `language`. */
  locale: string;
  /** Engine voice identifier (expo-speech `voice`); undefined = the engine's default for locale. */
  voiceId?: string;
}

export interface Speaker {
  /**
   * Speak one utterance. Resolves when it has finished OR was stopped — never rejects for a
   * stop. A rejection means the engine failed; the queue logs it and moves on.
   */
  speak(req: SpeakRequest): Promise<void>;
  /** Stop the current utterance immediately; its pending speak() must then resolve. */
  stop(): void;
}

export function speakRequest(text: string, language: AnalysisLanguage, voiceId?: string): SpeakRequest {
  return { text, language, locale: ttsConfigFor(language).locale, voiceId };
}

export interface LoggingSpeakerOptions {
  /** Where lines go; defaults to console.log. Pass `() => {}` for a silent speaker. */
  log?: (line: string) => void;
}

/** No-op engine: logs what would have been said and resolves at once. The default for now. */
export function loggingSpeaker(opts: LoggingSpeakerOptions = {}): Speaker {
  const log = opts.log ?? ((line: string) => console.log(line));
  return {
    speak(req) {
      log(`[tts ${req.locale}${req.voiceId ? ` ${req.voiceId}` : ''}] ${req.text}`);
      return Promise.resolve();
    },
    stop() {
      log('[tts] stop');
    },
  };
}

/**
 * The speaker the app uses. One instance per app — there is one audio output.
 * OSÄKER: returns the logging no-op until expo-speech is added, so the app is silent on
 * device. Risk: low for now (no screen speaks yet); must be swapped before G1 testing.
 */
export function createDefaultSpeaker(): Speaker {
  return loggingSpeaker();
}
