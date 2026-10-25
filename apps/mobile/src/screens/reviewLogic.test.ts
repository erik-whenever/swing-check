import { describe, expect, it } from 'vitest';
import type { RuleResult } from '@swingcheck/core/types';

import {
  countLabel,
  dayLabel,
  framesLabel,
  historySwingView,
  sessionBar,
  groupByDay,
  orderResultRows,
  passPercent,
  requiredAngleText,
  resultScore,
  trendDelta,
  weightDots,
} from './reviewLogic';

const r = (id: string, verdict: RuleResult['verdict']): RuleResult => ({ id, verdict, confidence: 0.8, relevant_frames: [] });

describe('orderResultRows', () => {
  it('fokus först, sedan missar (öppna), godkända (stängda), kan inte avgöras', () => {
    const rules = [r('a', 'pass'), r('b', 'cannot_determine'), r('c', 'fail'), r('f', 'fail'), r('d', 'pass'), r('e', 'fail')];
    const rows = orderResultRows(rules, r('f', 'fail'));
    expect(rows.map((x) => x.result.id)).toEqual(['f', 'c', 'e', 'a', 'd', 'b']);
    expect(rows.map((x) => x.kind)).toEqual(['focus', 'fail', 'fail', 'pass', 'pass', 'unknown']);
    expect(rows.map((x) => x.defaultOpen)).toEqual([true, true, true, false, false, false]);
  });

  it('utan fokus', () => {
    expect(orderResultRows([r('a', 'pass'), r('b', 'fail')]).map((x) => x.result.id)).toEqual(['b', 'a']);
  });
});

describe('resultScore', () => {
  it('räknar godkända av bedömbara, fokus en gång', () => {
    const rules = [r('a', 'pass'), r('b', 'cannot_determine'), r('c', 'fail')];
    expect(resultScore(rules, r('c', 'fail'))).toEqual({ passed: 1, assessable: 2 });
    expect(resultScore(rules, r('x', 'pass'))).toEqual({ passed: 2, assessable: 3 });
  });
});

describe('framesLabel', () => {
  it('formulerar svenska', () => {
    expect(framesLabel([])).toBeNull();
    expect(framesLabel([5])).toBe('Se i bild 5');
    expect(framesLabel([6, 5])).toBe('Se i bild 5 och 6');
    expect(framesLabel([3, 1, 2, 2])).toBe('Se i bild 1, 2 och 3');
  });
});

describe('regler', () => {
  it('vikt som prickar', () => {
    expect(weightDots(2)).toEqual([true, true, false]);
    expect(weightDots(9)).toEqual([true, true, true]);
  });
  it('krav på vinkel', () => {
    expect(requiredAngleText(['face-on'], 'dtl')).toBe('Kräver vinkel framifrån');
    expect(requiredAngleText(['dtl', 'face-on'], 'dtl')).toBeNull();
    expect(requiredAngleText([], 'dtl')).toBeNull();
  });
});

describe('historik', () => {
  const now = new Date(2026, 9, 25, 12, 0).getTime();
  it('daglabels', () => {
    expect(dayLabel(new Date(2026, 9, 25, 8).getTime(), now)).toBe('Idag');
    expect(dayLabel(new Date(2026, 9, 24, 8).getTime(), now)).toBe('Igår');
    expect(dayLabel(new Date(2026, 9, 22, 8).getTime(), now)).toBe('Torsdag 22 okt');
  });
  it('grupperar per dag, nyast först', () => {
    const items = [new Date(2026, 9, 22, 8).getTime(), new Date(2026, 9, 25, 9).getTime(), new Date(2026, 9, 25, 11).getTime()];
    const g = groupByDay(items, (x) => x, now);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ['Idag', 2],
      ['Torsdag 22 okt', 1],
    ]);
    expect(g[0].items[0]).toBe(items[2]);
  });
  it('procent, trend, räknare', () => {
    expect(passPercent(0, 0)).toBeNull();
    expect(passPercent(7, 12)).toBe(58);
    expect(trendDelta([{ value: 38 }, { value: 71 }])).toBe(33);
    expect(trendDelta([{ value: 1 }])).toBeNull();
    expect(countLabel(1, 'session', 'sessioner')).toBe('1 session');
    expect(countLabel(2, 'session', 'sessioner')).toBe('2 sessioner');
  });
});

describe('historySwingView / sessionBar', () => {
  it('mappar en post, fokus först, rensad video', () => {
    const v = historySwingView({
      id: 's1',
      timestamp: 1,
      videoUri: null,
      frameUris: ['file:///f1.jpg'],
      results: [r('a', 'pass'), r('f', 'fail'), r('b', 'cannot_determine')],
      overallAssessment: '',
      focusRuleId: 'f',
      videoPurged: true,
    });
    expect(v.dots).toEqual(['fail', 'pass', 'unknown']);
    expect([v.passed, v.assessable, v.videoPurged, v.thumbnailUri]).toEqual([1, 2, true, 'file:///f1.jpg']);
  });
  it('staplar', () => {
    expect(sessionBar(0, 0)).toBeNull();
    expect(sessionBar(3, 3)).toEqual({ height: 1, tone: 'pass' });
    expect(sessionBar(0, 3)?.tone).toBe('fail');
  });
});
