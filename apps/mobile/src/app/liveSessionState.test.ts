import { describe, expect, it } from 'vitest';
import type { RuleResult } from '@swingcheck/core/types';
import { initialLiveSession, liveElapsedMs, liveSessionReducer as r } from './liveSessionState';

const rule = (id: string, verdict: RuleResult['verdict']): RuleResult => ({ id, verdict, confidence: 0.8, relevant_frames: [] });

describe('liveSessionReducer', () => {
  it('clock runs from start, stops on pause, continues on resume', () => {
    let s = r(initialLiveSession(), { type: 'start', now: 1000 });
    expect(liveElapsedMs(s, 4000)).toBe(3000);
    s = r(s, { type: 'pause', now: 4000 });
    expect(s.status).toBe('paused');
    expect(liveElapsedMs(s, 60000)).toBe(3000);
    s = r(s, { type: 'resume', now: 10000 });
    expect(s.status).toBe('ready');
    expect(liveElapsedMs(s, 12000)).toBe(5000);
  });

  it('start is idempotent and does not unpause', () => {
    let s = r(initialLiveSession(), { type: 'start', now: 1000 });
    expect(r(s, { type: 'start', now: 5000 })).toBe(s);
    s = r(s, { type: 'pause', now: 2000 });
    expect(r(s, { type: 'start', now: 3000 })).toBe(s);
  });

  it('counts swings and tracks the focus rule; ignores swings while paused', () => {
    let s = r(initialLiveSession(), { type: 'start', now: 0 });
    s = r(s, { type: 'swingCaptured' });
    expect(s).toMatchObject({ status: 'analyzing', swingCount: 1 });
    s = r(s, { type: 'swingAnalyzed', results: [rule('a', 'fail'), rule('b', 'pass')], focusRuleId: 'a' });
    expect(s).toMatchObject({ status: 'ready', focusHistory: ['fail'] });
    expect(s.latest).toHaveLength(2);
    s = r(s, { type: 'pause', now: 10 });
    expect(r(s, { type: 'swingCaptured' })).toBe(s);
  });

  it('end resets everything', () => {
    let s = r(initialLiveSession(), { type: 'start', now: 0 });
    s = r(s, { type: 'swingCaptured' });
    expect(r(s, { type: 'end' })).toEqual(initialLiveSession());
  });
});
