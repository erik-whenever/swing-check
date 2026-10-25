// The one place that decides which language the user is answered in. The analysis prompt
// (api.ts → prompt.ts) and text-to-speech both read `getAnalysisLanguage()`, so the words
// the model writes and the voice that speaks them can never disagree.
//
// The shell sets it once at startup (and again if a setting changes it); core reads no
// environment or device locale itself.

export type AnalysisLanguage = 'sv' | 'en';

export const DEFAULT_ANALYSIS_LANGUAGE: AnalysisLanguage = 'sv';

export interface LanguageProfile {
  /** Name used in the prompt's response-language note ("Swedish"). */
  promptName: string;
  /** Example short_verdict in this language, given in the post-breakpoint note. */
  shortVerdictExamples: [string, string];
  /** BCP-47 locale for TTS: Web Speech `utterance.lang`, expo-speech `language`. */
  ttsLocale: string;
  /** Prefix a voice's `lang` must start with to count as this language (lowercase). */
  ttsLangPrefix: string;
}

export const LANGUAGE_PROFILES: Record<AnalysisLanguage, LanguageProfile> = {
  sv: {
    promptName: 'Swedish',
    shortVerdictExamples: ['Händerna för lågt i toppen', 'Bra axelrotation'],
    ttsLocale: 'sv-SE',
    ttsLangPrefix: 'sv',
  },
  en: {
    promptName: 'English',
    shortVerdictExamples: ['Hands too low at the top', 'Good shoulder turn'],
    ttsLocale: 'en-US',
    ttsLangPrefix: 'en',
  },
};

let current: AnalysisLanguage = DEFAULT_ANALYSIS_LANGUAGE;

export function setAnalysisLanguage(language: AnalysisLanguage): void {
  current = language;
}

export function getAnalysisLanguage(): AnalysisLanguage {
  return current;
}

/** TTS settings for a language — defaults to the current one. */
export function ttsConfigFor(language: AnalysisLanguage = current): {
  locale: string;
  langPrefix: string;
} {
  const p = LANGUAGE_PROFILES[language];
  return { locale: p.ttsLocale, langPrefix: p.ttsLangPrefix };
}
