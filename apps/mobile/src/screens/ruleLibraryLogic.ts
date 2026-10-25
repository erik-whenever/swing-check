// Ren filtrerings-/grupperingslogik för Regelbiblioteket (N-3.6 del 10).
// Inga React/expo-importer — bara typer och rena hjälpare från @swingcheck/core — så att rotens vitest kör testet.

import type { LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import { ruleMatchesAngle, type CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import { PHASE_LABEL, requiredAngleText } from './reviewLogic';

export type RulePhase = LibraryRule['phase'];
export type PhaseFilter = 'all' | RulePhase;

/** Svingens ordning — grupperna visas i den här följden. */
export const PHASE_ORDER: readonly RulePhase[] = ['address', 'backswing', 'top', 'downswing', 'impact', 'follow'];

export interface LibraryRow {
  rule: LibraryRule;
  selected: boolean;
  /** Kan bedömas från vald vinkel. Annars nedtonad med `need` ("Kräver vinkel framifrån"). */
  matchesAngle: boolean;
  need: string | null;
  validated: boolean;
}

export interface LibraryGroup {
  phase: RulePhase;
  label: string;
  rows: LibraryRow[];
}

export interface LibraryFilterInput {
  library: readonly LibraryRule[];
  query: string;
  phase: PhaseFilter;
  angle: CameraAngle;
  selectedIds: ReadonlySet<string>;
  validatedIds?: ReadonlySet<string>;
}

/** Gemener, utan diakritik (å/ä/ö → a/a/o) och hopslagna blanksteg — så "hoft" hittar "Höft". */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alla sökord måste finnas någonstans i titel, beskrivning eller fasens svenska namn.
 * OSÄKER: core-titlarna är i dag engelska — svensk fritext träffar bara fasnamnet tills
 * biblioteket översätts (i18n). Risk låg: sökningen blir smalare, aldrig fel.
 */
export function matchesQuery(rule: LibraryRule, query: string): boolean {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const hay = normalizeSearch(`${rule.title} ${rule.description} ${PHASE_LABEL[rule.phase]}`);
  return terms.every((t) => hay.includes(t));
}

/**
 * Filtrerar på sök + fas och grupperar per fas i svingens ordning. Vinkeln filtrerar inte bort
 * något — regler som inte kan bedömas från den visas nedtonade sist i sin grupp (de går ändå att
 * välja till ett eget set; rulesModel lämnar dem utanför analysen). Inom bedömbara/ej bedömbara:
 * vikt fallande, sedan bibliotekets ordning. Tomma grupper utelämnas.
 */
export function groupLibrary(input: LibraryFilterInput): LibraryGroup[] {
  const validated = input.validatedIds ?? new Set<string>();
  const rows = input.library
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => (input.phase === 'all' || rule.phase === input.phase) && matchesQuery(rule, input.query))
    .map(({ rule, i }) => {
      const matchesAngle = ruleMatchesAngle(rule, input.angle);
      const row: LibraryRow = {
        rule,
        selected: input.selectedIds.has(rule.id),
        matchesAngle,
        need: matchesAngle ? null : (requiredAngleText(rule.angles, input.angle) ?? 'Kan inte bedömas från vinkeln'),
        validated: validated.has(rule.id),
      };
      return { row, i };
    })
    .sort(
      (a, b) =>
        Number(b.row.matchesAngle) - Number(a.row.matchesAngle) || b.row.rule.weight - a.row.rule.weight || a.i - b.i,
    );

  return PHASE_ORDER.flatMap((phase): LibraryGroup[] => {
    const inPhase = rows.filter(({ row }) => row.rule.phase === phase).map(({ row }) => row);
    return inPhase.length ? [{ phase, label: PHASE_LABEL[phase], rows: inPhase }] : [];
  });
}

/** Antal regler per fas i hela biblioteket (fas-chipens räknare), oberoende av sökningen. */
export function phaseCounts(library: readonly LibraryRule[]): Record<PhaseFilter, number> {
  const counts = { all: library.length } as Record<PhaseFilter, number>;
  for (const p of PHASE_ORDER) counts[p] = 0;
  for (const r of library) counts[r.phase] += 1;
  return counts;
}

/** Valda som faktiskt finns i biblioteket (gamla/okända id räknas inte). */
export function selectedCount(library: readonly LibraryRule[], selectedIds: ReadonlySet<string>): number {
  return library.reduce((n, r) => n + Number(selectedIds.has(r.id)), 0);
}

/** "3 valda" / "Inga valda". */
export function selectedLabel(n: number): string {
  return n === 0 ? 'Inga valda' : `${n} ${n === 1 ? 'vald' : 'valda'}`;
}

/** Träffrad under sökfältet: "4 regler" / "1 regel" / "Inga träffar". */
export function resultLabel(groups: readonly LibraryGroup[]): string {
  const n = groups.reduce((s, g) => s + g.rows.length, 0);
  return n === 0 ? 'Inga träffar' : `${n} ${n === 1 ? 'regel' : 'regler'}`;
}
