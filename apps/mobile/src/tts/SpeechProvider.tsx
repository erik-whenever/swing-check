// App-wide speech (N-3.6 part 9): one SpeechQueue over one Speaker — there is one audio output,
// so "Läs upp" and the live session must share the queue (barge-in vs. in-order). Put
// <SpeechProvider> once near the root, inside AppStateProvider (the language comes from settings).

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';

import { useSettings } from '../state';
import { createDefaultSpeaker } from './device';
import { SpeechQueue, type JobOutcome } from './queue';
import { buildSpeechScript, type ScriptOptions, type SpeechSource } from './script';
import type { Speaker } from './speaker';

type CallerScriptOptions = Omit<ScriptOptions, 'variant' | 'language'>;

export interface SpeechApi {
  queue: SpeechQueue;
  /** The analysis language from settings — the same value the prompt is built with. */
  language: AnalysisLanguage;
  /** Result screen's "Läs upp": replaces whatever is speaking with the full script. */
  readAloud(analysis: SpeechSource, opts?: CallerScriptOptions): Promise<JobOutcome>;
  /** Hands-free session: queued after earlier swings, never interrupts. */
  enqueueLive(analysis: SpeechSource, opts?: CallerScriptOptions): Promise<JobOutcome>;
  stop(): void;
}

const SpeechContext = createContext<SpeechApi | null>(null);

export interface SpeechProviderProps {
  /** Inject an engine (previews, tests); default is expo-speech. */
  speaker?: Speaker;
  children: ReactNode;
}

export function SpeechProvider({ speaker, children }: SpeechProviderProps) {
  const { settings } = useSettings();
  const language = settings.language;
  const [queue] = useState(
    () =>
      new SpeechQueue(speaker ?? createDefaultSpeaker(), {
        onError: (err, u) => console.warn(`[tts] ${u.kind}: ${String(err)}`),
      }),
  );
  useEffect(() => () => queue.stop(), [queue]);

  const api = useMemo<SpeechApi>(
    () => ({
      queue,
      language,
      readAloud: (analysis, opts) =>
        queue.say(buildSpeechScript(analysis, { ...opts, variant: 'full', language }), { language }),
      enqueueLive: (analysis, opts) =>
        queue.enqueue(buildSpeechScript(analysis, { ...opts, variant: 'live', language }), { language }),
      stop: () => queue.stop(),
    }),
    [queue, language],
  );
  return <SpeechContext.Provider value={api}>{children}</SpeechContext.Provider>;
}

/** The app's speech API. Throws outside the provider — a missing provider is a wiring bug. */
export function useSpeech(): SpeechApi {
  const api = useContext(SpeechContext);
  if (!api) throw new Error('useSpeech: wrap the app in <SpeechProvider>');
  return api;
}
