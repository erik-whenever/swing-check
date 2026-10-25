// The engine seam (N-3.6 part 8). Everything above this — script builder, queue, screens,
// live session — talks to `Speaker`; only an adapter knows which engine actually speaks.
//
// The expo-speech adapter (`expoSpeechSpeaker`) is here but takes the engine as a parameter,
// so this file never imports a native module and stays testable from the root vitest. The
// real module is bound in ./device.ts (`createDefaultSpeaker`). See docs/native/tts.md.

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
 * The subset of expo-speech's API the adapter needs (`import * as Speech from 'expo-speech'`
 * satisfies it). Kept structural so tests pass a fake engine.
 */
export interface SpeechEngineOptions {
  language?: string;
  voice?: string;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: Error) => void;
}

export interface SpeechEngine {
  speak(text: string, options?: SpeechEngineOptions): void;
  stop(): Promise<void> | void;
}

/**
 * Speaker over expo-speech. One utterance at a time (SpeechQueue serialises); speak() resolves
 * on onDone/onStopped, rejects on onError. stop() resolves the pending speak() at once instead
 * of waiting for onStopped — iOS (AVSpeech) is known to drop callbacks after a stop, and a late
 * callback only touches its own closure, so it cannot settle a newer utterance.
 */
export function expoSpeechSpeaker(engine: SpeechEngine): Speaker {
  let pending: (() => void) | null = null;
  const settleCurrent = () => {
    const p = pending;
    pending = null;
    p?.();
  };
  return {
    speak(req) {
      // A speak() while one is in flight means the caller skipped stop(); never leave a dangling promise.
      settleCurrent();
      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          if (pending === done) pending = null;
          if (err) reject(err);
          else resolve();
        };
        const done = () => finish();
        pending = done;
        try {
          engine.speak(req.text, {
            language: req.locale,
            voice: req.voiceId,
            onDone: done,
            onStopped: done,
            onError: (e) => finish(e instanceof Error ? e : new Error(String(e))),
          });
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
    stop() {
      settleCurrent();
      try {
        void Promise.resolve(engine.stop()).catch(() => {});
      } catch {
        // A failing stop must not break the queue; the watchdog covers a stuck engine.
      }
    },
  };
}
