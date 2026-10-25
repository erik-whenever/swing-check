import { describe, expect, it } from 'vitest';

import { elapsedLabel, focusTrendBlocks, liveScore, liveStatusText, toLiveVerdict, trendCountLabel } from './liveSessionLogic';

describe('toLiveVerdict', () => {
  it('mappar RuleResult-domar och null', () => {
    expect(toLiveVerdict('pass')).toBe('pass');
    expect(toLiveVerdict('fail')).toBe('fail');
    expect(toLiveVerdict('cannot_determine')).toBe('unknown');
    expect(toLiveVerdict(null)).toBe('unknown');
  });
});

describe('liveScore', () => {
  it('godkända av bedömbara', () => {
    expect(liveScore(['pass', 'fail', 'pass'])).toEqual({ passed: 2, assessable: 3 });
    expect(liveScore(['pass', 'cannot_determine'])).toEqual({ passed: 1, assessable: 1 });
    expect(liveScore([])).toEqual({ passed: 0, assessable: 0 });
  });
});

describe('focusTrendBlocks', () => {
  it('sju senaste, senaste markerad', () => {
    const h = ['pass', 'fail', 'pass', 'fail', 'pass', 'pass', 'pass', 'fail'] as const;
    const b = focusTrendBlocks(h);
    expect(b.map((x) => x.kind)).toEqual(['fail', 'pass', 'fail', 'pass', 'pass', 'pass', 'fail']);
    expect(b.map((x) => x.now)).toEqual([false, false, false, false, false, false, true]);
    expect(trendCountLabel(b)).toBe('4 av 7');
  });

  it('fyller ut med tomma till höger', () => {
    const b = focusTrendBlocks(['pass', null]);
    expect(b.map((x) => x.kind)).toEqual(['pass', 'unknown', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(b.findIndex((x) => x.now)).toBe(1);
    expect(trendCountLabel(b)).toBe('1 av 2');
  });

  it('tom session', () => {
    const b = focusTrendBlocks([]);
    expect(b.every((x) => x.kind === 'empty' && !x.now)).toBe(true);
    expect(trendCountLabel(b)).toBe('');
  });
});

describe('liveStatusText', () => {
  it('svenska tillstånd', () => {
    expect(liveStatusText('ready')).toEqual({ title: 'Redo', detail: 'Slå när du vill' });
    expect(liveStatusText('analyzing').title).toBe('Analyserar');
    expect(liveStatusText('listening').title).toBe('Lyssnar');
  });
});

describe('elapsedLabel', () => {
  it('minuter och timmar', () => {
    expect(elapsedLabel(30_000)).toBe('<1 min');
    expect(elapsedLabel(14 * 60_000 + 5_000)).toBe('14 min');
    expect(elapsedLabel(65 * 60_000)).toBe('1 h 5 min');
    expect(elapsedLabel(120 * 60_000)).toBe('2 h');
    expect(elapsedLabel(-5)).toBe('<1 min');
  });
});
