// Ren sammanställning för Historiken (N-3.6 del 13): HistoryEntry[] → sessionsrader, enstaka
// uppladdningar och fokusregelns trend. Inga React/expo-importer så att rotens vitest kör testet.
// Designkälla: d1 README "Historik" — trenden visar "procent godkända per session" för fokusregeln.

import type { HistoryEntry } from '../state/historyModel';
import { historySwingView, type HistorySwingView } from './reviewLogic';

export interface TrendPoint {
  timestamp: number;
  /** Andel godkända för fokusregeln, 0–100. */
  value: number;
}

export interface HistoryTrend {
  ruleTitle: string;
  /** Äldst först. */
  points: readonly TrendPoint[];
  /** Andel godkända i fönstret, 0–100. */
  percent: number;
  /** "de senaste 3 veckorna". */
  windowLabel: string;
}

export interface HistorySwing extends HistorySwingView {
  kind: 'swing';
  /** "Uppladdat klipp" / "Sving 3". */
  title?: string;
}

export interface HistorySession {
  kind: 'session';
  id: string;
  /** "Livesession". */
  title: string;
  startedAt: number;
  endedAt: number;
  /** En per sving i ordning: godkända av bedömbara (0/0 = ingen dom → streckad stapel). */
  swings: readonly { passed: number; assessable: number }[];
  /** Sessionens svingar som rader, äldst först — visas när sessionsraden fälls ut. */
  swingItems?: readonly HistorySwing[];
}

export type HistoryItem = HistorySession | HistorySwing;

export const SESSION_TITLE = 'Livesession';
export const UPLOAD_TITLE = 'Uppladdat klipp';

/**
 * Svingar med samma `sessionId` blir en sessionsrad (äldst först inuti); övriga blir egna rader.
 * Ordningen ut är nyast först (sessionens start avgör), som `sortHistory`.
 */
export function buildHistoryItems(entries: readonly HistoryEntry[]): HistoryItem[] {
  const bySession = new Map<string, HistoryEntry[]>();
  const items: HistoryItem[] = [];
  for (const e of entries) {
    if (e.sessionId) {
      const list = bySession.get(e.sessionId);
      if (list) list.push(e);
      else bySession.set(e.sessionId, [e]);
    } else {
      items.push({ ...historySwingView(e), kind: 'swing', title: UPLOAD_TITLE });
    }
  }
  for (const [id, list] of bySession) {
    const swings = [...list].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const swingItems = swings.map((e, i): HistorySwing => ({ ...historySwingView(e), kind: 'swing', title: `Sving ${i + 1}` }));
    items.push({
      kind: 'session',
      id,
      title: SESSION_TITLE,
      startedAt: swings[0].timestamp,
      endedAt: swings[swings.length - 1].timestamp,
      swings: swingItems.map(({ passed, assessable }) => ({ passed, assessable })),
      swingItems,
    });
  }
  const t = (i: HistoryItem) => (i.kind === 'session' ? i.startedAt : i.timestamp);
  return items.sort((a, b) => t(b) - t(a) || a.id.localeCompare(b.id));
}

/** Fokusregeln = den senaste svingens (samma källa som Regler-skärmen). */
export function currentFocusRuleId(entries: readonly HistoryEntry[]): string | undefined {
  let best: HistoryEntry | undefined;
  for (const e of entries) if (e.focusRuleId && (!best || e.timestamp > best.timestamp)) best = e;
  return best?.focusRuleId;
}

export const TREND_WINDOW_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Fokusregelns trend: en punkt per träningstillfälle i fönstret (äldst först) med andelen godkända
 * för regeln. En livesession är ett tillfälle; uppladdningar utan session slås ihop per lokal dag.
 * Svingar där regeln inte gick att avgöra (eller saknas) räknas inte. null = inget att visa.
 *
 * OSÄKER: d1 säger "procent godkända per session"; att lösa uppladdningar räknas per dag är min
 * tolkning (annars blir varje uppladdning en 0- eller 100-punkt). Risk låg, visuell.
 */
export function focusTrend(
  entries: readonly HistoryEntry[],
  focusRuleId: string | undefined,
  ruleTitle: string,
  now: number,
  windowDays: number = TREND_WINDOW_DAYS,
): HistoryTrend | null {
  if (!focusRuleId) return null;
  const from = now - windowDays * DAY_MS;
  const groups = new Map<string, { t: number; passed: number; assessable: number }>();
  let passed = 0;
  let assessable = 0;
  for (const e of entries) {
    if (e.timestamp < from || e.timestamp > now) continue;
    const r = e.results.find((x) => x.id === focusRuleId);
    if (!r || r.verdict === 'cannot_determine') continue;
    const ok = r.verdict === 'pass' ? 1 : 0;
    passed += ok;
    assessable += 1;
    const key = e.sessionId ? `s:${e.sessionId}` : `d:${dayKey(e.timestamp)}`;
    const g = groups.get(key);
    if (g) {
      g.t = Math.min(g.t, e.timestamp);
      g.passed += ok;
      g.assessable += 1;
    } else groups.set(key, { t: e.timestamp, passed: ok, assessable: 1 });
  }
  if (assessable === 0) return null;
  const points = [...groups.values()]
    .sort((a, b) => a.t - b.t)
    .map((g) => ({ timestamp: g.t, value: Math.round((g.passed / g.assessable) * 100) }));
  return {
    ruleTitle,
    points,
    percent: Math.round((passed / assessable) * 100),
    windowLabel: windowLabel(windowDays),
  };
}

/** "de senaste 3 veckorna" / "de senaste 10 dagarna". */
export function windowLabel(days: number): string {
  if (days % 7 === 0) {
    const w = days / 7;
    return w === 1 ? 'den senaste veckan' : `de senaste ${w} veckorna`;
  }
  return days === 1 ? 'det senaste dygnet' : `de senaste ${days} dagarna`;
}
