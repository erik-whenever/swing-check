// Ren härledningslogik för Resultat-, Regler- och Historikskärmarna (N-3.6 del 5).
// Inga React/expo-importer — bara typer från @swingcheck/core — så att rotens vitest kör testet.

import type { RuleResult } from '@swingcheck/core/types';
import type { LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { HistoryEntry } from '../state/historyModel';

// ── Resultat ──

export type ResultRowKind = 'focus' | 'fail' | 'pass' | 'unknown';

export interface ResultRow {
  result: RuleResult;
  kind: ResultRowKind;
  /** Missar (och fokus) visas öppna, godkända och "kan inte avgöras" stängda. */
  defaultOpen: boolean;
}

function kindOf(r: RuleResult): Exclude<ResultRowKind, 'focus'> {
  return r.verdict === 'pass' ? 'pass' : r.verdict === 'fail' ? 'fail' : 'unknown';
}

/**
 * d1 README "Resultat": fokusregeln först, sedan missar (öppna), godkända (stängda) och sist
 * "kan inte avgöras". Inom varje grupp behålls analysens ordning (stabil sortering).
 * Fokusregeln tas bort ur listan om den också finns där (samma id).
 */
export function orderResultRows(rules: readonly RuleResult[], focus?: RuleResult | null): ResultRow[] {
  const rank: Record<Exclude<ResultRowKind, 'focus'>, number> = { fail: 0, pass: 1, unknown: 2 };
  const rest = rules
    .filter((r) => !focus || r.id !== focus.id)
    .map((result, i) => ({ result, kind: kindOf(result), i }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.i - b.i)
    .map(({ result, kind }): ResultRow => ({ result, kind, defaultOpen: kind === 'fail' }));
  return focus ? [{ result: focus, kind: 'focus', defaultOpen: true }, ...rest] : rest;
}

/** Ringen: godkända av bedömbara (pass + fail). Fokus räknas en gång även om den finns i listan. */
export function resultScore(rules: readonly RuleResult[], focus?: RuleResult | null): { passed: number; assessable: number } {
  const all = focus && !rules.some((r) => r.id === focus.id) ? [focus, ...rules] : rules;
  let passed = 0;
  let assessable = 0;
  for (const r of all) {
    if (r.verdict === 'cannot_determine') continue;
    assessable += 1;
    if (r.verdict === 'pass') passed += 1;
  }
  return { passed, assessable };
}

/**
 * "Se i bild 5 och 6". relevant_frames tolkas som 1-baserade bildnummer, så som Claude skriver dem.
 * OSÄKER: webbens prompt numrerar bilderna 1… — byter den till 0-baserat blir länken fel med ett. Risk låg.
 */
export function framesLabel(frames: readonly number[]): string | null {
  const uniq = [...new Set(frames.filter((f) => Number.isFinite(f)))].sort((a, b) => a - b);
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return `Se i bild ${uniq[0]}`;
  return `Se i bild ${uniq.slice(0, -1).join(', ')} och ${uniq[uniq.length - 1]}`;
}

// ── Regler ──

export const PHASE_LABEL: Record<LibraryRule['phase'], string> = {
  address: 'Uppställning',
  backswing: 'Baksving',
  top: 'Topp',
  downswing: 'Nedsving',
  impact: 'Träff',
  follow: 'Avslut',
};

/** Fasväljarens korta etiketter (resultatets tracer-yta). */
export const PHASE_SHORT: Record<LibraryRule['phase'], string> = {
  address: 'Uppst.',
  backswing: 'Baksv.',
  top: 'Topp',
  downswing: 'Nedsv.',
  impact: 'Träff',
  follow: 'Avslut',
};

export const ANGLE_LABEL_SV: Record<CameraAngle, string> = {
  dtl: 'Längs linjen',
  'face-on': 'Framifrån',
};

/** Vad en regel kräver när den inte kan bedömas från vald vinkel: "Kräver vinkel framifrån". */
export function requiredAngleText(ruleAngles: readonly CameraAngle[], current: CameraAngle): string | null {
  if (ruleAngles.length === 0 || ruleAngles.includes(current)) return null;
  const need = ruleAngles[0];
  return need === 'face-on' ? 'Kräver vinkel framifrån' : 'Kräver vinkel längs linjen';
}

/** Vikt 1–3 som tre prickar: true = ifylld. */
export function weightDots(weight: number): [boolean, boolean, boolean] {
  const w = Math.max(0, Math.min(3, Math.round(weight)));
  return [w >= 1, w >= 2, w >= 3];
}

// ── Historik ──

export interface DayGroup<T> {
  /** Lokal dag som YYYY-MM-DD. */
  key: string;
  label: string;
  items: T[];
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "Idag", "Igår" eller "Torsdag 23 okt" (lokal tid). */
export function dayLabel(ms: number, now: number): string {
  const k = dayKey(ms);
  if (k === dayKey(now)) return 'Idag';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (k === dayKey(y.getTime())) return 'Igår';
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Kort datum för trendaxeln: "4 okt" eller "Idag". */
export function shortDate(ms: number, now: number): string {
  if (dayKey(ms) === dayKey(now)) return 'Idag';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Grupperar per lokal dag, nyast först; posternas inbördes ordning (nyast först) behålls. */
export function groupByDay<T>(items: readonly T[], timeOf: (item: T) => number, now: number): DayGroup<T>[] {
  const sorted = [...items].sort((a, b) => timeOf(b) - timeOf(a));
  const groups: DayGroup<T>[] = [];
  for (const item of sorted) {
    const t = timeOf(item);
    const key = dayKey(t);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(t, now), items: [item] });
  }
  return groups;
}

/** Andel godkända i procent (avrundad), eller null om inget var bedömbart. */
export function passPercent(passed: number, assessable: number): number | null {
  return assessable > 0 ? Math.round((passed / assessable) * 100) : null;
}

/** Förändring i procentenheter mellan första och sista trendpunkten. */
export function trendDelta(points: readonly { value: number }[]): number | null {
  if (points.length < 2) return null;
  return Math.round(points[points.length - 1].value - points[0].value);
}

/** "1 session" / "2 sessioner" — dagens räknare i historiken. */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Klockslag "10:42" (lokal tid). */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type SwingDot = 'pass' | 'fail' | 'unknown';

/** En uppladdad sving som historikrad: tumnagel (om bilderna finns kvar), prickar och poäng. */
export interface HistorySwingView {
  id: string;
  timestamp: number;
  thumbnailUri: string | null;
  /** N-3.5: videon rensad av lagringsgränsen — resultatet finns kvar. */
  videoPurged: boolean;
  dots: SwingDot[];
  passed: number;
  assessable: number;
  angle?: CameraAngle;
}

/** HistoryEntry (src/state/historyModel) → historikrad. Fokusregeln placeras först bland prickarna. */
export function historySwingView(entry: HistoryEntry): HistorySwingView {
  const isFocus = (r: RuleResult) => Number(r.id === entry.focusRuleId);
  const results = [...entry.results].sort((a, b) => isFocus(b) - isFocus(a));
  const { passed, assessable } = resultScore(results);
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    thumbnailUri: entry.framesPurged ? null : (entry.frameUris[0] ?? null),
    videoPurged: Boolean(entry.videoPurged),
    dots: results.map((r) => kindOf(r)),
    passed,
    assessable,
    angle: entry.cameraAngle,
  };
}

/**
 * Stapelhöjd (0–1) och ton för en sving i en session. null = ingen dom (streckad).
 * OSÄKER: skissen visar höjd ≈ andel godkända, grön från hälften. Tröskeln är min tolkning. Risk låg, visuell.
 */
export function sessionBar(passed: number, assessable: number): { height: number; tone: 'pass' | 'fail' } | null {
  if (assessable <= 0) return null;
  const frac = passed / assessable;
  return { height: 0.35 + 0.65 * frac, tone: frac >= 0.5 ? 'pass' : 'fail' };
}
