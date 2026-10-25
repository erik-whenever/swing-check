import { describe, expect, it } from 'vitest';
import { RULE_LIBRARY, type LibraryRule } from '@swingcheck/core/data/ruleLibrary';

import {
  groupLibrary,
  matchesQuery,
  normalizeSearch,
  phaseCounts,
  resultLabel,
  selectedCount,
  selectedLabel,
} from './ruleLibraryLogic';

const rule = (id: string, phase: LibraryRule['phase'], weight: 1 | 2 | 3, angles: LibraryRule['angles'], title = id): LibraryRule => ({
  id,
  title,
  description: `${title} description`,
  phase,
  weight,
  angles,
  drills: [],
});

const LIB: LibraryRule[] = [
  rule('a', 'follow', 2, ['dtl'], 'Balanced finish'),
  rule('b', 'address', 1, ['dtl'], 'Grip'),
  rule('c', 'address', 3, ['face-on'], 'Höft'),
  rule('d', 'address', 3, ['dtl'], 'Spine angle'),
  rule('e', 'address', 2, [], 'Any angle'),
];

const base = { library: LIB, query: '', phase: 'all' as const, angle: 'dtl' as const, selectedIds: new Set<string>() };

describe('normalizeSearch / matchesQuery', () => {
  it('ignores case, diacritics and extra spaces', () => {
    expect(normalizeSearch('  HÖFT   och  Ä ')).toBe('hoft och a');
    expect(matchesQuery(LIB[2], 'hoft')).toBe(true);
  });
  it('requires every term, across title, description and Swedish phase name', () => {
    expect(matchesQuery(LIB[3], 'spine uppst')).toBe(true);
    expect(matchesQuery(LIB[3], 'spine avslut')).toBe(false);
    expect(matchesQuery(LIB[0], '')).toBe(true);
  });
});

describe('groupLibrary', () => {
  it('groups in swing order and omits empty phases', () => {
    const g = groupLibrary(base);
    expect(g.map((x) => x.phase)).toEqual(['address', 'follow']);
    expect(g[0].label).toBe('Uppställning');
  });

  it('puts angle-matching rules first, then weight desc, then library order; off-angle rows are dimmed with need', () => {
    const rows = groupLibrary(base)[0].rows;
    expect(rows.map((r) => r.rule.id)).toEqual(['d', 'e', 'b', 'c']);
    const c = rows[3];
    expect(c.matchesAngle).toBe(false);
    expect(c.need).toBe('Kräver vinkel framifrån');
    expect(rows[1].matchesAngle).toBe(true); // tom angles = vinkeloberoende
    expect(rows[0].need).toBeNull();
  });

  it('filters by phase and query, and marks selected/validated', () => {
    const g = groupLibrary({ ...base, phase: 'address', query: 'grip', selectedIds: new Set(['b']), validatedIds: new Set(['b']) });
    expect(g).toHaveLength(1);
    expect(g[0].rows).toHaveLength(1);
    expect(g[0].rows[0]).toMatchObject({ selected: true, validated: true });
    expect(groupLibrary({ ...base, query: 'nothing-here' })).toEqual([]);
  });

  it('defaults to unvalidated', () => {
    expect(groupLibrary(base).flatMap((x) => x.rows).every((r) => !r.validated)).toBe(true);
  });

  it('works on the real core library', () => {
    const g = groupLibrary({ ...base, library: RULE_LIBRARY });
    expect(g.reduce((n, x) => n + x.rows.length, 0)).toBe(RULE_LIBRARY.length);
  });
});

describe('counts and labels', () => {
  it('phaseCounts covers all phases', () => {
    expect(phaseCounts(LIB)).toEqual({ all: 5, address: 4, backswing: 0, top: 0, downswing: 0, impact: 0, follow: 1 });
  });
  it('selectedCount ignores unknown ids', () => {
    expect(selectedCount(LIB, new Set(['a', 'zzz']))).toBe(1);
  });
  it('labels', () => {
    expect(selectedLabel(0)).toBe('Inga valda');
    expect(selectedLabel(1)).toBe('1 vald');
    expect(selectedLabel(3)).toBe('3 valda');
    expect(resultLabel([])).toBe('Inga träffar');
    expect(resultLabel(groupLibrary(base))).toBe('5 regler');
  });
});
