import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { Chip } from '../ui';

/**
 * Swing-phase tag. All phases share one tint on purpose: six competing hues turned
 * every rule row into a sticker sheet, and the phase is context, not a verdict.
 */
export function RuleBadge({ phase }: { phase: string }) {
  const t = useT();
  const key = `phase.${phase}` as TranslationKey;
  const label = t(key);
  return <Chip tone="accent">{label === key ? phase : label}</Chip>;
}
