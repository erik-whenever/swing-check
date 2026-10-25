// Local live-session state (N-3.6 del 9): status, clock and swing counter for the Session tab.
// Pure reducer — no React/RN imports, tested from the root vitest. The live pipeline (camera,
// swing detection, N-3.4) will dispatch `swingCaptured`/`swingAnalyzed` into this.

import type { RuleResult } from '@swingcheck/core/types';
import type { LiveStatus } from '../screens/liveSessionLogic';

export interface LiveSessionState {
  status: LiveStatus;
  /** Time run before the current running stretch (ms). */
  accumulatedMs: number;
  /** When the current running stretch began; null while paused or not started. */
  runningSince: number | null;
  /** Swings captured this session; 0 before the first. */
  swingCount: number;
  /** Latest swing's results (active rules, display order). */
  latest: readonly RuleResult[];
  /** Focus rule's verdict per swing, oldest first. */
  focusHistory: readonly (RuleResult['verdict'] | null)[];
}

export type LiveSessionAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'end' }
  | { type: 'swingCaptured' }
  | { type: 'swingAnalyzed'; results: readonly RuleResult[]; focusRuleId?: string | null };

export function initialLiveSession(): LiveSessionState {
  return { status: 'ready', accumulatedMs: 0, runningSince: null, swingCount: 0, latest: [], focusHistory: [] };
}

export function liveElapsedMs(s: LiveSessionState, now: number): number {
  return s.accumulatedMs + (s.runningSince == null ? 0 : Math.max(0, now - s.runningSince));
}

export function liveSessionReducer(s: LiveSessionState, a: LiveSessionAction): LiveSessionState {
  switch (a.type) {
    case 'start':
      return s.runningSince != null || s.status === 'paused' ? s : { ...s, runningSince: a.now };
    case 'pause':
      if (s.status === 'paused') return s;
      return { ...s, status: 'paused', accumulatedMs: liveElapsedMs(s, a.now), runningSince: null };
    case 'resume':
      if (s.status !== 'paused') return s;
      return { ...s, status: 'ready', runningSince: a.now };
    case 'end':
      return initialLiveSession();
    case 'swingCaptured':
      if (s.status === 'paused') return s;
      return { ...s, status: 'analyzing', swingCount: s.swingCount + 1 };
    case 'swingAnalyzed': {
      const focus = a.focusRuleId ? (a.results.find((r) => r.id === a.focusRuleId)?.verdict ?? null) : null;
      return {
        ...s,
        status: s.status === 'paused' ? 'paused' : 'ready',
        latest: a.results,
        focusHistory: a.focusRuleId ? [...s.focusHistory, focus] : s.focusHistory,
      };
    }
  }
}
