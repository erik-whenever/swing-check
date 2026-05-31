export type Language = 'sv' | 'en';

export interface LanguageInfo {
  code: Language;
  /** Native name shown in the language menu. */
  label: string;
}

/**
 * Add new languages here — the picker and detection pick them up automatically.
 * Also add a matching colored flag in components/Home/FlagIcon.tsx.
 */
export const AVAILABLE_LANGUAGES: LanguageInfo[] = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

export function getLanguageInfo(code: Language): LanguageInfo {
  return (
    AVAILABLE_LANGUAGES.find((l) => l.code === code) ?? AVAILABLE_LANGUAGES[0]
  );
}

/** Pick the best available language from the browser's locale preferences. */
export function detectLanguage(): Language {
  const prefs =
    typeof navigator !== 'undefined'
      ? navigator.languages ?? [navigator.language]
      : [];
  for (const pref of prefs) {
    const base = pref?.toLowerCase().split('-')[0];
    const match = AVAILABLE_LANGUAGES.find((l) => l.code === base);
    if (match) return match.code;
  }
  return DEFAULT_LANGUAGE;
}
