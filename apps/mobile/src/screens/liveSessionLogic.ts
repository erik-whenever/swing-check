// Ren härledning för livesessionen (N-3.6 del 7). Inga React-/RN-importer — testas av rotens vitest.

import type { RuleResult } from '@swingcheck/core/types';

/** Formmärkets dom (samma tre former som `ui/VerdictMark`). */
export type LiveVerdict = 'pass' | 'fail' | 'unknown';

/**
 * Sessionens tillstånd som skärmen visar.
 * ready = väntar på slag, listening = röststyrning lyssnar efter kommando,
 * analyzing = slag fångat, bedöms, paused = användaren har pausat.
 */
export type LiveStatus = 'ready' | 'listening' | 'analyzing' | 'paused';

export const TREND_BLOCKS = 7;

export function toLiveVerdict(v: RuleResult['verdict'] | LiveVerdict | null | undefined): LiveVerdict {
  return v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'unknown';
}

const STATUS_TEXT: Record<LiveStatus, { title: string; detail: string }> = {
  ready: { title: 'Redo', detail: 'Slå när du vill' },
  listening: { title: 'Lyssnar', detail: 'Säg ett kommando' },
  analyzing: { title: 'Analyserar', detail: 'Bedömer svingen' },
  paused: { title: 'Pausad', detail: 'Säg "fortsätt" eller tryck Fortsätt' },
};

/** Tillståndsrutans rubrik (36 pt volt) och undertext. */
export function liveStatusText(status: LiveStatus): { title: string; detail: string } {
  return STATUS_TEXT[status];
}

/** Poängen för senaste svingen: godkända av bedömbara (pass + fail), som resultatringen. */
export function liveScore(verdicts: readonly (RuleResult['verdict'] | LiveVerdict)[]): { passed: number; assessable: number } {
  let passed = 0;
  let assessable = 0;
  for (const v of verdicts) {
    const lv = toLiveVerdict(v);
    if (lv === 'pass') passed++;
    if (lv !== 'unknown') assessable++;
  }
  return { passed, assessable };
}

export type TrendBlockKind = LiveVerdict | 'empty';

export interface TrendBlock {
  kind: TrendBlockKind;
  /** Senaste svingen — får vit ring. */
  now: boolean;
}

/**
 * Fokusregelns trend som sju block. `history` är fokusregelns dom per sving, äldst först;
 * `null` = ingen dom (t.ex. svingen kunde inte bedömas). De sju senaste visas, vänster → höger,
 * och tomma platser fyller ut till höger tills sessionen har sju svingar.
 */
export function focusTrendBlocks(
  history: readonly (RuleResult['verdict'] | LiveVerdict | null)[],
  count = TREND_BLOCKS,
): TrendBlock[] {
  const recent = history.slice(-count);
  const blocks: TrendBlock[] = recent.map((v, i) => ({ kind: toLiveVerdict(v), now: i === recent.length - 1 }));
  while (blocks.length < count) blocks.push({ kind: 'empty', now: false });
  return blocks;
}

/** "4 av 7" — godkända av de visade svingarna. Tomt när inga svingar finns. */
export function trendCountLabel(blocks: readonly TrendBlock[]): string {
  const shown = blocks.filter((b) => b.kind !== 'empty').length;
  if (shown === 0) return '';
  return `${blocks.filter((b) => b.kind === 'pass').length} av ${shown}`;
}

/** Sessionens längd: "<1 min", "14 min", "1 h 5 min". */
export function elapsedLabel(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
