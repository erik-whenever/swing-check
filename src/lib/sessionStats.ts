// SESSION SUMMARY (D-5) — the one line to read after a range session.
//
// WHY THIS EXISTS. Session mode already logs richly per swing (`Session swing N
// captured` / `… analyzed`) plus a `Live pose stats` line every five seconds. That
// is the right granularity while debugging ONE swing, and the wrong one after a real
// range session: 20+ minutes and 30+ swings produce several hundred lines, and the
// question the field test actually asks — *did this session work?* — has no line to
// answer it. This collector accumulates while the session runs and emits a single
// WARN line when it ends. WARN because the in-app log panel shows nothing below it,
// and the phone is where this gets read.
//
// MEDIANS AND p95, NOT AVERAGES. One 40 s Vision call on a flaky range connection
// drags a mean far enough to be meaningless. The median says what a swing normally
// cost; the p95 says how bad the tail got. Both are needed to judge the mode.
//
// A MODULE SINGLETON, NOT A STORE. There is exactly one session at a time by
// construction, and the recorders below run on the rAF thread and inside the
// analysis queue — neither should re-render anything. `store/session.ts` owns the
// lifecycle (`startSession` → `begin()`, `endSession` → `end()`) and keeps the
// returned summary for the UI.
//
// EVERY RECORDER IS A NO-OP UNTIL `begin()`. Live detection also runs outside a
// session when the dev preview is on; that traffic must not land in a session's
// numbers, and the `active` flag is what keeps it out.
//
// Pure apart from the final log line: no React, no DOM, no timers. Unit-testable.

import { createLogger } from './logger';
import type { AnalysisUsage } from './api';

const log = createLogger('SessionStats');

/** Median and p95 of one measurement over the session. Null when never measured. */
export interface Distribution {
  median: number | null;
  p95: number | null;
}

export interface SessionSummary {
  /** Wall-clock length of the session, `begin()` → `end()`. */
  durationSec: number;
  /** Swings the live detector accepted. */
  swingsDetected: number;
  /** Swings that got a Vision verdict. */
  swingsAnalyzed: number;
  /** Swings that failed at any stage. Detected − analyzed − failed = still in flight. */
  swingsFailed: number;
  /** Anchor → the detector accepted the swing. Structural ~0.6–1.1 s. */
  detectedMs: Distribution;
  /** Anchor → frames ready. Chain value, so it INCLUDES `detectedMs`. */
  framesMs: Distribution;
  /** The Claude Vision call itself — a stage cost, not anchor-relative. */
  visionMs: Distribution;
  /** Anchor → spoken feedback finished. The number the mode lives or dies by. */
  spokenMedianMs: number | null;
  /** posesDetected / samples over the whole session, 0–1. Null when nothing sampled. */
  poseDetectionRate: number | null;
  /** Median sampling rate actually achieved. A falling value across a session is throttling. */
  achievedFpsMedian: number | null;
  /** Video chunks the ring overwrote. Sampled at swing capture — see `recordWindow`. */
  ringEvicted: number;
  /** Largest materialized window, MB. The memory high-water mark of the session. */
  maxWindowMb: number;
  /** Sum of the per-analysis cost `api.ts` already computes. */
  totalCostUsd: number;
  // The three numbers below explain totalCostUsd and visionMs rather than restating them:
  // generation dominates the call, output scales with the rule count, and quick mode picks
  // the schema. Without them a session's cost or latency cannot be attributed to a cause.
  /** Schema the analyses asked for. Last value seen — null when nothing was analysed. */
  quickMode: boolean | null;
  /** Median output tokens per analysis. The number that tracks generation latency. */
  medianOutputTokens: number | null;
  /** Median UNCACHED input tokens per analysis — essentially the image cost. */
  medianInputTokens: number | null;
  /** Rules judged per analysis. Last value seen — null when nothing was analysed. */
  activeRuleCount: number | null;
  /** Unique failure messages with counts, most frequent first. */
  failureReasons: { reason: string; count: number }[];
}

class SessionStatsCollector {
  private active = false;
  private startedAtMs = 0;

  private detected: number[] = [];
  private frames: number[] = [];
  private vision: number[] = [];
  private spoken: number[] = [];
  private achievedFps: number[] = [];

  private swingsDetected = 0;
  private swingsAnalyzed = 0;
  private swingsFailed = 0;

  private poseSamples = 0;
  private posesDetected = 0;
  // Last cumulative counters seen from a LivePoseLoop instance, for delta accounting.
  private lastLoopSamples = 0;
  private lastLoopPoses = 0;

  private ringEvicted = 0;
  private lastRingEvicted = 0;
  private maxWindowMb = 0;

  private costUsd = 0;
  private outputTokens: number[] = [];
  private inputTokens: number[] = [];
  private quickMode: boolean | null = null;
  private activeRuleCount: number | null = null;
  private failures = new Map<string, number>();

  /** Start a session: zero everything and begin recording. */
  begin(): void {
    this.active = true;
    this.startedAtMs = Date.now();
    this.detected = [];
    this.frames = [];
    this.vision = [];
    this.spoken = [];
    this.achievedFps = [];
    this.swingsDetected = 0;
    this.swingsAnalyzed = 0;
    this.swingsFailed = 0;
    this.poseSamples = 0;
    this.posesDetected = 0;
    this.lastLoopSamples = 0;
    this.lastLoopPoses = 0;
    this.ringEvicted = 0;
    this.lastRingEvicted = 0;
    this.maxWindowMb = 0;
    this.costUsd = 0;
    this.outputTokens = [];
    this.inputTokens = [];
    this.quickMode = null;
    this.activeRuleCount = null;
    this.failures = new Map();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** The live detector accepted a swing. `detectedMs` is anchor-relative. */
  recordDetected(detectedMs: number): void {
    if (!this.active) return;
    this.swingsDetected++;
    this.detected.push(detectedMs);
  }

  /**
   * A video window was cut for a swing.
   *
   * `ringEvicted` is the ring's own cumulative counter, and a session can span
   * several recordings (a break to change club builds a new ring), so it is
   * accumulated as a delta and a counter that went BACKWARDS is read as "new ring".
   * Sampling only happens at capture time, so evictions after the last swing of a
   * recording are not counted — this is a memory-pressure indicator, not an audit.
   */
  recordWindow(window: { windowMb: number; ringEvicted: number }): void {
    if (!this.active) return;
    this.ringEvicted +=
      window.ringEvicted >= this.lastRingEvicted
        ? window.ringEvicted - this.lastRingEvicted
        : window.ringEvicted;
    this.lastRingEvicted = window.ringEvicted;
    if (window.windowMb > this.maxWindowMb) this.maxWindowMb = window.windowMb;
  }

  /** A swing got its verdict. `framesMs` is anchor-relative, `visionMs` is the call. */
  recordAnalyzed(timings: { framesMs: number | null; visionMs: number }): void {
    if (!this.active) return;
    this.swingsAnalyzed++;
    if (timings.framesMs !== null) this.frames.push(timings.framesMs);
    this.vision.push(timings.visionMs);
  }

  /** Spoken feedback finished. Anchor-relative. */
  recordSpoken(spokenMs: number): void {
    if (!this.active) return;
    this.spoken.push(spokenMs);
  }

  /**
   * A swing failed, at any stage. The message is kept verbatim and counted rather
   * than bucketed: after a field test the useful question is "which error, how many
   * times", and a bucket would hide the one that only happened twice.
   */
  recordFailure(reason: string): void {
    if (!this.active) return;
    this.swingsFailed++;
    this.failures.set(reason, (this.failures.get(reason) ?? 0) + 1);
  }

  /**
   * Token accounting for one analysis, exactly as `api.ts` reported it.
   *
   * `quickMode`/`activeRuleCount` describe the request, not a measurement, so they are
   * kept as the last value seen rather than aggregated: both can change mid-session
   * (the TTS mode toggle, editing rules) and the last one is what the tail of the
   * session actually ran with. Tokens are kept per analysis so the summary can report
   * medians — one 40 s outlier skews a mean the same way it does for `visionMs`.
   */
  recordUsage(usage: AnalysisUsage): void {
    if (!this.active) return;
    this.costUsd += usage.costUsd;
    this.outputTokens.push(usage.outputTokens);
    this.inputTokens.push(usage.inputTokens);
    this.quickMode = usage.quickMode;
    this.activeRuleCount = usage.activeRuleCount;
  }

  /**
   * A `LiveLoopStats` tick. `samples`/`posesDetected` are cumulative for ONE loop
   * instance, and a session can hold several, so both are accumulated as deltas with
   * the same "went backwards ⇒ new loop" rule as `recordWindow`.
   *
   * Ticks arrive at the loop's stats interval (5 s), so the last few seconds of each
   * recording go uncounted. Over a range session that is well under a percent of the
   * samples and buys not having to touch the loop.
   */
  recordPoseStats(stats: {
    samples: number;
    posesDetected: number;
    achievedFps: number;
  }): void {
    if (!this.active) return;
    this.poseSamples +=
      stats.samples >= this.lastLoopSamples
        ? stats.samples - this.lastLoopSamples
        : stats.samples;
    this.posesDetected +=
      stats.posesDetected >= this.lastLoopPoses
        ? stats.posesDetected - this.lastLoopPoses
        : stats.posesDetected;
    this.lastLoopSamples = stats.samples;
    this.lastLoopPoses = stats.posesDetected;
    if (stats.achievedFps > 0) this.achievedFps.push(stats.achievedFps);
  }

  /**
   * End the session: build the summary, log it, stop recording.
   *
   * Returns null when no session was running, which makes a second `endSession()`
   * (the headset double-press and the button can both land) a no-op rather than a
   * second, emptied summary line.
   */
  end(): SessionSummary | null {
    if (!this.active) return null;
    this.active = false;

    const summary: SessionSummary = {
      durationSec: Math.round((Date.now() - this.startedAtMs) / 1000),
      swingsDetected: this.swingsDetected,
      swingsAnalyzed: this.swingsAnalyzed,
      swingsFailed: this.swingsFailed,
      detectedMs: distribution(this.detected),
      framesMs: distribution(this.frames),
      visionMs: distribution(this.vision),
      spokenMedianMs: median(this.spoken),
      poseDetectionRate:
        this.poseSamples > 0 ? round3(this.posesDetected / this.poseSamples) : null,
      achievedFpsMedian: round1OrNull(median(this.achievedFps)),
      ringEvicted: this.ringEvicted,
      maxWindowMb: round2(this.maxWindowMb),
      totalCostUsd: parseFloat(this.costUsd.toFixed(4)),
      quickMode: this.quickMode,
      medianOutputTokens: median(this.outputTokens),
      medianInputTokens: median(this.inputTokens),
      activeRuleCount: this.activeRuleCount,
      failureReasons: [...this.failures.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };

    log.warn('Session summary', summary);
    return summary;
  }
}

export const sessionStats = new SessionStatsCollector();

// ── Statistics ───────────────────────────────────────────────────────────────

function distribution(values: number[]): Distribution {
  return { median: median(values), p95: percentile(values, 0.95) };
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

/**
 * Nearest-rank percentile on a copy of the input.
 *
 * Same convention `livePoseLoop.stats()` uses for its p95 — deliberately, so the
 * two p95 figures in the logs mean the same thing. With few samples it simply
 * returns an actual observation, which is the honest answer for n=3 swings.
 */
function percentile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function round1OrNull(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
