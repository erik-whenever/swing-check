import { AVAILABLE_LANGUAGES, type Language } from './languages';

/**
 * ISO-3166 country code → app language. Add a row when you add a language
 * that has a clear "home" country. Countries not listed fall back to the
 * browser-locale detection in languages.ts.
 */
const COUNTRY_LANGUAGE: Record<string, Language> = {
  SE: 'sv',
};

/** Only map to a language we actually ship. */
function asAvailable(lang: Language | undefined): Language | null {
  if (!lang) return null;
  return AVAILABLE_LANGUAGES.some((l) => l.code === lang) ? lang : null;
}

/**
 * Look up the visitor's country from their IP and map it to a language.
 * Returns null on any failure (offline, blocked, unknown country) so the
 * caller can keep the browser-locale default. Best-effort, never throws.
 */
export async function detectLanguageByGeo(
  signal?: AbortSignal,
): Promise<Language | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal });
    if (!res.ok) return null;
    const data: { country_code?: string } = await res.json();
    const code = data.country_code?.toUpperCase();
    if (!code) return null;
    return asAvailable(COUNTRY_LANGUAGE[code]);
  } catch {
    return null;
  }
}
