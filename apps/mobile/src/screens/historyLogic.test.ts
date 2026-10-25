import { describe, expect, it } from 'vitest';
import type { RuleResult } from '@swingcheck/core/types';

import type { HistoryEntry } from '../state/historyModel';
import { buildHistoryItems, currentFocusRuleId, focusTrend, windowLabel, type HistorySession } from './historyLogic';

const r = (id: string, verdict: RuleResult['verdict']): RuleResult => ({ id, verdict, confidence: 0.8, relevant_frames: [] });
const H = 60 * 60 * 1000;
const D = 24 * H;
const NOW = new Date(2026, 9, 25, 15, 0).getTime();

function entry(id: string, timestamp: number, results: RuleResult[], extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, timestamp, videoUri: null, frameUris: [], results, overallAssessment: '', ...extra };
}

describe('buildHistoryItems', () => {
  it('grupperar samma sessionId till en sessionsrad, enstaka uppladdningar blir egna rader', () => {
    const items = buildHistoryItems([
      entry('u1', NOW - 1 * H, [r('a', 'pass')]),
      entry('s2', NOW - 2 * H, [r('a', 'fail'), r('b', 'pass')], { sessionId: 'S' }),
      entry('s1', NOW - 3 * H, [r('a', 'pass'), r('b', 'pass')], { sessionId: 'S' }),
      entry('s3', NOW - 2.5 * H, [r('a', 'cannot_determine')], { sessionId: 'S' }),
      entry('u0', NOW - 5 * H, [r('a', 'fail')]),
    ]);
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['swing:u1', 'session:S', 'swing:u0']);
    const s = items[1] as HistorySession;
    expect(s.title).toBe('Livesession');
    expect(s.startedAt).toBe(NOW - 3 * H);
    expect(s.endedAt).toBe(NOW - 2 * H);
    // Äldst först: s1, s3, s2.
    expect(s.swings).toEqual([
      { passed: 2, assessable: 2 },
      { passed: 0, assessable: 0 },
      { passed: 1, assessable: 2 },
    ]);
    expect(s.swingItems?.map((x) => [x.id, x.title])).toEqual([
      ['s1', 'Sving 1'],
      ['s3', 'Sving 2'],
      ['s2', 'Sving 3'],
    ]);
    expect(items[0]).toMatchObject({ kind: 'swing', title: 'Uppladdat klipp' });
  });

  it('tom historik → inga rader', () => {
    expect(buildHistoryItems([])).toEqual([]);
  });
});

describe('currentFocusRuleId', () => {
  it('tar den senaste svingens fokusregel', () => {
    expect(
      currentFocusRuleId([
        entry('a', NOW - 2 * H, [], { focusRuleId: 'old' }),
        entry('b', NOW - 1 * H, [], { focusRuleId: 'new' }),
        entry('c', NOW, []),
      ]),
    ).toBe('new');
    expect(currentFocusRuleId([entry('c', NOW, [])])).toBeUndefined();
  });
});

describe('focusTrend', () => {
  it('en punkt per session, uppladdningar per dag, äldst först; procent över hela fönstret', () => {
    const t = focusTrend(
      [
        entry('s1', NOW - 3 * D, [r('f', 'pass')], { sessionId: 'A' }),
        entry('s2', NOW - 3 * D + H, [r('f', 'fail')], { sessionId: 'A' }),
        entry('u1', NOW - 1 * D, [r('f', 'pass')]),
        entry('u2', NOW - 1 * D + H, [r('f', 'pass')]),
        entry('x', NOW - 2 * D, [r('f', 'cannot_determine')]),
        entry('y', NOW - 2 * D, [r('other', 'fail')]),
        entry('old', NOW - 30 * D, [r('f', 'fail')]),
      ],
      'f',
      'Höften roterar',
      NOW,
    );
    expect(t).not.toBeNull();
    expect(t!.ruleTitle).toBe('Höften roterar');
    expect(t!.points).toEqual([
      { timestamp: NOW - 3 * D, value: 50 },
      { timestamp: NOW - 1 * D, value: 100 },
    ]);
    expect(t!.percent).toBe(75);
    expect(t!.windowLabel).toBe('de senaste 3 veckorna');
  });

  it('ingen fokusregel eller inget bedömbart → null', () => {
    expect(focusTrend([entry('a', NOW, [r('f', 'pass')])], undefined, '', NOW)).toBeNull();
    expect(focusTrend([entry('a', NOW, [r('f', 'cannot_determine')])], 'f', '', NOW)).toBeNull();
    expect(focusTrend([entry('a', NOW - 40 * D, [r('f', 'pass')])], 'f', '', NOW)).toBeNull();
  });
});

describe('windowLabel', () => {
  it('veckor och dagar', () => {
    expect(windowLabel(21)).toBe('de senaste 3 veckorna');
    expect(windowLabel(7)).toBe('den senaste veckan');
    expect(windowLabel(10)).toBe('de senaste 10 dagarna');
  });
});
