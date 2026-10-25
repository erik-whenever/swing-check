// Maps analysis errors from core to text the UI can show, in the user's language (N-3.6).
// Pure, no expo imports. The Worker's own message is not shown: it is always Swedish,
// and the app may be set to English.

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import {
  ApiNotConfiguredError,
  TruncatedResponseError,
  UsageCapReachedError,
} from '@swingcheck/core/lib/api';

export type AnalysisErrorKind =
  | 'usage-cap-install'
  | 'usage-cap-daily'
  | 'not-configured'
  | 'truncated'
  | 'network'
  | 'unknown';

export interface AnalysisErrorView {
  kind: AnalysisErrorKind;
  title: string;
  message: string;
  /** Whether a "try again" action makes sense right now. */
  retryable: boolean;
}

const TEXT: Record<AnalysisErrorKind, Record<AnalysisLanguage, { title: string; message: string }>> = {
  'usage-cap-install': {
    sv: { title: 'Dagens analyser är slut', message: 'Den här installationen har använt dagens analyser. Försök igen efter midnatt UTC.' },
    en: { title: "Today's analyses are used up", message: 'This installation has used its analyses for today. Try again after midnight UTC.' },
  },
  'usage-cap-daily': {
    sv: { title: 'Dagens analyser är slut', message: 'Tjänstens dagliga tak är nått. Försök igen efter midnatt UTC.' },
    en: { title: "Today's analyses are used up", message: "The service's daily limit is reached. Try again after midnight UTC." },
  },
  'not-configured': {
    sv: { title: 'Analys är inte tillgänglig', message: 'Appen saknar analysadress. Inspelning och historik fungerar ändå.' },
    en: { title: 'Analysis unavailable', message: 'The app has no analysis address. Recording and history still work.' },
  },
  truncated: {
    sv: { title: 'Analysen blev avbruten', message: 'Svaret blev för långt. Försök igen, eller med färre regler.' },
    en: { title: 'Analysis was cut off', message: 'The answer was too long. Try again, or with fewer rules.' },
  },
  network: {
    sv: { title: 'Ingen anslutning', message: 'Kunde inte nå analysen. Kontrollera nätet och försök igen.' },
    en: { title: 'No connection', message: 'Could not reach the analysis. Check the network and try again.' },
  },
  unknown: {
    sv: { title: 'Analysen misslyckades', message: 'Något gick fel. Försök igen.' },
    en: { title: 'Analysis failed', message: 'Something went wrong. Try again.' },
  },
};

function named(err: unknown, name: string): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === name;
}

export function classifyAnalysisError(err: unknown): AnalysisErrorKind {
  // instanceof first; the name is a fallback should two copies of core end up in the bundle.
  if (err instanceof UsageCapReachedError || named(err, 'UsageCapReachedError')) {
    return (err as { scope?: unknown }).scope === 'install' ? 'usage-cap-install' : 'usage-cap-daily';
  }
  if (err instanceof ApiNotConfiguredError || named(err, 'ApiNotConfiguredError')) return 'not-configured';
  if (err instanceof TruncatedResponseError || named(err, 'TruncatedResponseError')) return 'truncated';
  // OSÄKER: RN's fetch rejects with TypeError('Network request failed') when offline; other
  // TypeErrors (bugs) land here too. Risk: low — only the wording shown.
  if (err instanceof TypeError) return 'network';
  return 'unknown';
}

export function analysisErrorView(err: unknown, language: AnalysisLanguage): AnalysisErrorView {
  const kind = classifyAnalysisError(err);
  return {
    kind,
    ...TEXT[kind][language],
    retryable: kind === 'truncated' || kind === 'network' || kind === 'unknown',
  };
}
