import { describe, it, expect, beforeEach } from 'vitest';
import { sessionStats } from './sessionStats';
import type { AnalysisUsage } from './api';

/** An `AnalysisUsage` with only the fields a test cares about spelled out. */
function usage(partial: Partial<AnalysisUsage> = {}): AnalysisUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    visionMs: 0,
    quickMode: false,
    maxTokens: 2000,
    activeRuleCount: 0,
    frameCount: 0,
    ...partial,
  };
}

// The collector is a module singleton (one session at a time by construction), so
// every test starts from `begin()`.
beforeEach(() => {
  sessionStats.begin();
});

describe('sessionStats', () => {
  it('ignores everything recorded outside a session', () => {
    sessionStats.end();
    sessionStats.recordDetected(800);
    sessionStats.recordAnalyzed({ framesMs: 1000, visionMs: 3000 });
    sessionStats.recordFailure('nope');
    sessionStats.recordUsage(usage({ costUsd: 1, outputTokens: 500 }));
    expect(sessionStats.end()).toBeNull();

    // And a fresh session starts from zero, not from the ignored traffic.
    sessionStats.begin();
    const summary = sessionStats.end()!;
    expect(summary.swingsDetected).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.detectedMs.median).toBeNull();
    expect(summary.medianOutputTokens).toBeNull();
    expect(summary.quickMode).toBeNull();
  });

  it('summarizes a session with medians and p95', () => {
    for (const ms of [700, 800, 900, 1000, 5000]) sessionStats.recordDetected(ms);
    for (const ms of [2000, 3000, 4000]) {
      sessionStats.recordAnalyzed({ framesMs: ms, visionMs: ms * 2 });
    }
    sessionStats.recordSpoken(9000);
    sessionStats.recordSpoken(11000);

    const s = sessionStats.end()!;
    expect(s.swingsDetected).toBe(5);
    expect(s.swingsAnalyzed).toBe(3);
    expect(s.detectedMs.median).toBe(900);
    // Nearest-rank: the worst observation, which is the point of a p95 over 5 swings.
    expect(s.detectedMs.p95).toBe(5000);
    expect(s.framesMs.median).toBe(3000);
    expect(s.visionMs.median).toBe(6000);
    expect(s.spokenMedianMs).toBe(11000);
  });

  it('counts failures per unique reason, most frequent first', () => {
    sessionStats.recordFailure('API error 529');
    sessionStats.recordFailure('Videofönstret fanns inte kvar i bufferten');
    sessionStats.recordFailure('API error 529');
    sessionStats.recordFailure('API error 529');

    const s = sessionStats.end()!;
    expect(s.swingsFailed).toBe(4);
    expect(s.failureReasons).toEqual([
      { reason: 'API error 529', count: 3 },
      { reason: 'Videofönstret fanns inte kvar i bufferten', count: 1 },
    ]);
  });

  it('sums analysis cost', () => {
    sessionStats.recordUsage(usage({ costUsd: 0.0123 }));
    sessionStats.recordUsage(usage({ costUsd: 0.0456 }));
    expect(sessionStats.end()!.totalCostUsd).toBeCloseTo(0.0579, 4);
  });

  it('reports median tokens and the last request shape seen', () => {
    sessionStats.recordUsage(
      usage({ inputTokens: 3000, outputTokens: 400, quickMode: true, activeRuleCount: 5 })
    );
    sessionStats.recordUsage(
      usage({ inputTokens: 3200, outputTokens: 900, quickMode: true, activeRuleCount: 5 })
    );
    // Request shape changed mid-session (TTS mode toggled, a rule added) — the summary
    // reports what the tail of the session actually ran with, not an average of shapes.
    sessionStats.recordUsage(
      usage({ inputTokens: 3100, outputTokens: 1800, quickMode: false, activeRuleCount: 6 })
    );

    const s = sessionStats.end()!;
    expect(s.medianInputTokens).toBe(3100);
    expect(s.medianOutputTokens).toBe(900);
    expect(s.quickMode).toBe(false);
    expect(s.activeRuleCount).toBe(6);
  });

  it('accumulates pose counters across loop restarts', () => {
    // One recording…
    sessionStats.recordPoseStats({ samples: 75, posesDetected: 70, achievedFps: 14.9 });
    sessionStats.recordPoseStats({ samples: 150, posesDetected: 140, achievedFps: 15.0 });
    // …then a new LivePoseLoop instance, whose counters start over. A count that
    // went backwards must be read as "new loop", not as lost samples.
    sessionStats.recordPoseStats({ samples: 50, posesDetected: 40, achievedFps: 10.0 });

    const s = sessionStats.end()!;
    expect(s.poseDetectionRate).toBe(round3(180 / 200));
    expect(s.achievedFpsMedian).toBe(14.9);
  });

  it('accumulates ring evictions across rings and keeps the largest window', () => {
    sessionStats.recordWindow({ windowMb: 4.2, ringEvicted: 10 });
    sessionStats.recordWindow({ windowMb: 7.5, ringEvicted: 25 });
    // New recording ⇒ new ring, counter restarts.
    sessionStats.recordWindow({ windowMb: 3.1, ringEvicted: 5 });

    const s = sessionStats.end()!;
    expect(s.ringEvicted).toBe(30);
    expect(s.maxWindowMb).toBe(7.5);
  });

  it('returns null on a second end so a double press cannot blank the summary', () => {
    sessionStats.recordDetected(800);
    expect(sessionStats.end()!.swingsDetected).toBe(1);
    expect(sessionStats.end()).toBeNull();
  });
});

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
