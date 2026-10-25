// Ren logik för Inställningar (N-3.5 UI-resten, N-3.6 del 14): medietakets val, lagringsrad och
// varningen innan ett lägre tak rensar media. Inga expo-importer, testas från rotens vitest.

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import { mbToBytes } from '@swingcheck/core/lib/mediaRetention';
import type { PlayerLevel } from '@swingcheck/core/lib/recommendRules';
import { MEDIA_CAP_MAX_MB, MEDIA_CAP_MIN_MB } from '../state/settingsModel';

// OSÄKER: förval i stället för reglage (inget nytt native-beroende → ingen ombyggd dev-klient).
// 300 MB är standardtaket; 1 GB räcker för ett par slow-mo-klipp per dag i en vecka. Risk: låg.
export const MEDIA_CAP_PRESETS_MB: readonly number[] = [150, 300, 600, 1000];

export const LANGUAGE_OPTIONS: readonly { value: AnalysisLanguage; label: string }[] = [
  { value: 'sv', label: 'Svenska' },
  { value: 'en', label: 'English' },
];

export const LEVEL_OPTIONS: readonly { value: PlayerLevel; label: string }[] = [
  { value: 'beginner', label: 'Nybörjare' },
  { value: 'intermediate', label: 'Medelnivå' },
  { value: 'advanced', label: 'Avancerad' },
];

const BYTES_PER_MB = 1024 * 1024;

/** "1 GB" / "1,5 GB" från 1000 MB och uppåt, annars hela MB. Svensk decimalkomma. */
export function formatMb(mb: number): string {
  if (mb >= 1000) {
    const gb = Math.round((mb / 1024) * 10) / 10;
    return `${String(gb).replace('.', ',')} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function formatBytes(bytes: number): string {
  const mb = Math.max(0, bytes) / BYTES_PER_MB;
  // Under 1 MB men inte noll ska inte se tomt ut.
  return mb > 0 && mb < 1 ? '< 1 MB' : formatMb(mb);
}

/** Förvalen som segment; ett sparat tak utanför förvalen visas som eget segment, i storleksordning. */
export function capOptions(currentMb: number): { value: string; label: string }[] {
  const values = MEDIA_CAP_PRESETS_MB.includes(currentMb) ? [...MEDIA_CAP_PRESETS_MB] : [...MEDIA_CAP_PRESETS_MB, currentMb];
  return values
    .filter((mb) => mb >= MEDIA_CAP_MIN_MB && mb <= MEDIA_CAP_MAX_MB)
    .sort((a, b) => a - b)
    .map((mb) => ({ value: String(mb), label: formatMb(mb) }));
}

/** "124 MB av 300 MB" + andel 0–1 för stapeln. */
export function storageSummary(usedBytes: number, capMb: number): { label: string; fraction: number } {
  const cap = mbToBytes(capMb);
  return {
    label: `${formatBytes(usedBytes)} av ${formatMb(capMb)}`,
    fraction: cap > 0 ? Math.min(1, Math.max(0, usedBytes / cap)) : 0,
  };
}

/** Text för bekräftelsen när det nya taket är lägre än det som redan ligger lagrat; annars null. */
export function capChangeWarning(usedBytes: number, newCapMb: number): string | null {
  if (usedBytes <= mbToBytes(newCapMb)) return null;
  return `Du har ${formatBytes(usedBytes)} sparat. Med ${formatMb(newCapMb)} rensas video, och vid behov bildrutor, från de äldsta svingarna direkt. Resultaten sparas alltid.`;
}
