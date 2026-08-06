// STEG 2 + 3 (Ström D, Pass 3 — envelope-inversion) — Envelope frame selection.
//
// Given a frame budget B and the swing envelope (poseEnvelope.ts), pick B
// timestamps. Two layers, in order of trust:
//
//   STEG 2 (baseline): spread the WHOLE budget UNIFORMLY IN TIME over the swing
//   envelope [start, finish]. This is the default output and guarantees coverage
//   of the whole swing including the impact region — no phase weighting, nothing
//   that can collapse. Uniform endpoints put a frame on address (start) and on the
//   finish landmark for free.
//
//   STEG 3 (confident-only polish): ONLY when the envelope carries a confident
//   impact, reallocate a share of the budget into a tight cluster around impact,
//   keeping the rest as uniform baseline (so address + finish stay covered). If
//   impact is not confident we keep the pure baseline — a VALID good outcome, not
//   a fallback-to-garbage. `impactClusterApplied` reports which happened.
//
// Pure + testable: timestamps in, timestamps out. Frame grabbing lives in
// poseFrameGrab.ts. Selection signal only — no rules.
//
// If the envelope itself is not usable (`valid === false`), we fall back to Pass
// 1's even distribution across the pose sample span and flag it.

import type { SwingPhase } from './frameExtractor';
import type { SwingEnvelope } from './poseEnvelope';

// ── Tunables ─────────────────────────────────────────────────────────────────
/**
 * IMPACT-CLUSTER BUDGET SHARE. Fraction of the frame budget reallocated into the
 * impact cluster when impact is confident. The rest stays uniform over the
 * envelope, so address + finish keep coverage. 0.4 → ~8 of 20 frames on impact.
 */
const IMPACT_CLUSTER_BUDGET_FRAC = 0.4;
/** Impact cluster is at least this many frames when applied. */
const IMPACT_CLUSTER_MIN_FRAMES = 2;
/** IMPACT-CLUSTER SPACING. Hard floor on spacing near impact (source is ~16 fps). */
const IMPACT_CLUSTER_SPACING_SEC = 0.06;
/** Merge picks closer than this (avoids grabbing the same source frame twice). */
const DEDUPE_SEC = 0.03;

export interface FramePick {
  t: number;
  phase: SwingPhase;
}

export interface EnvelopeSelection {
  picks: FramePick[];
  /** Frames actually allocated per phase label (after dedupe). */
  allocation: Partial<Record<SwingPhase, number>>;
  /** True when the envelope (not the even-over-span fallback) drove selection. */
  usedEnvelope: boolean;
  /** True when we fell back to even distribution (inverse of the above). */
  fellBackToEven: boolean;
  /** True when a confident impact cluster was layered on the uniform baseline. */
  impactClusterApplied: boolean;
  /** The swing envelope (boundaries + impact + diagnostics) for verification. */
  envelope: SwingEnvelope;
  reason?: string;
}

/**
 * Allocate `budget` frames over the swing. Uniform-in-time across the envelope is
 * the baseline; a confident impact adds a tight cluster on top. Falls back to even
 * distribution across [spanStart, spanEnd] when the envelope is not usable.
 */
export function selectEnvelopeFrames(
  envelope: SwingEnvelope,
  budget: number,
  spanStart: number,
  spanEnd: number,
): EnvelopeSelection {
  if (budget <= 0) {
    return {
      picks: [],
      allocation: {},
      usedEnvelope: false,
      fellBackToEven: false,
      impactClusterApplied: false,
      envelope,
    };
  }

  // No usable envelope → even over the whole pose span, flagged.
  if (!envelope.valid) {
    return {
      ...evenFallback(budget, spanStart, spanEnd),
      usedEnvelope: false,
      fellBackToEven: true,
      impactClusterApplied: false,
      envelope,
      reason: envelope.reason ?? 'no usable envelope',
    };
  }

  const start = envelope.startSec;
  // Guard a degenerate envelope (finish not after start): fall back to spanEnd so
  // the window still has positive width instead of collapsing to a point.
  const finish = envelope.finishSec > start ? envelope.finishSec : spanEnd;

  const spacing = Math.max(IMPACT_CLUSTER_SPACING_SEC, envelope.sampleDt);
  const tol = spacing;

  let picks: FramePick[];
  let impactClusterApplied = false;

  if (envelope.impact) {
    // STEG 3: confident impact → cluster part of the budget around impact, keep
    // the remainder as uniform baseline (address + finish stay covered).
    const clusterCount = clamp(
      Math.round(budget * IMPACT_CLUSTER_BUDGET_FRAC),
      IMPACT_CLUSTER_MIN_FRAMES,
      Math.max(IMPACT_CLUSTER_MIN_FRAMES, budget - 2),
    );
    const baselineCount = budget - clusterCount;

    const raw: number[] = [
      ...uniform(baselineCount, start, finish),
      ...cluster(envelope.impact.timeSec, clusterCount, spacing),
    ];
    picks = raw
      .map((t) => clamp(t, start, finish))
      .sort((a, b) => a - b)
      .map((t) => ({ t, phase: labelPhase(t, envelope, tol) }));
    impactClusterApplied = true;
  } else {
    // STEG 2: pure uniform-in-time baseline over the envelope.
    picks = uniform(budget, start, finish).map((t) => ({
      t,
      phase: labelPhase(t, envelope, tol),
    }));
  }

  const deduped = dedupe(picks);
  return {
    picks: deduped,
    allocation: tally(deduped),
    usedEnvelope: true,
    fellBackToEven: false,
    impactClusterApplied,
    envelope,
  };
}

/** `n` evenly spaced times in [a, b], endpoints included (so a & b are sampled). */
function uniform(n: number, a: number, b: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * (i / (n - 1)));
  return out;
}

/** `k` frames centred on `center`, spaced `spacing` seconds apart. */
function cluster(center: number, k: number, spacing: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    out.push(center + (i - (k - 1) / 2) * spacing);
  }
  return out;
}

/** Coarse label for a time within the envelope, used for the tile chips. When a
 *  confident impact exists we can name top/downswing/impact; otherwise we fall
 *  back to thirds of the envelope. */
function labelPhase(t: number, env: SwingEnvelope, tol: number): SwingPhase {
  const { startSec, finishSec, impact } = env;
  if (t <= startSec + tol) return 'address';
  if (!impact) {
    const span = finishSec - startSec;
    const f = span > 0 ? (t - startSec) / span : 1;
    return f < 0.5 ? 'backswing' : f < 0.85 ? 'downswing' : 'follow-through';
  }
  if (Math.abs(t - impact.timeSec) <= tol) return 'impact';
  if (t < impact.topSec) return 'backswing';
  if (Math.abs(t - impact.topSec) <= tol) return 'top';
  if (t < impact.timeSec) return 'downswing';
  return 'follow-through';
}

function evenFallback(
  budget: number,
  start: number,
  end: number,
): Pick<EnvelopeSelection, 'picks' | 'allocation'> {
  const picks: FramePick[] = [];
  for (let i = 0; i < budget; i++) {
    const f = budget === 1 ? 0 : i / (budget - 1);
    const t = start + (end - start) * f;
    // Coarse thirds just so the tiles carry a label; not a real phase read.
    const phase: SwingPhase =
      i === 0 ? 'address' : f < 0.5 ? 'backswing' : f < 0.85 ? 'downswing' : 'follow-through';
    picks.push({ t, phase });
  }
  return { picks, allocation: tally(picks) };
}

function dedupe(picks: FramePick[]): FramePick[] {
  const out: FramePick[] = [];
  for (const p of picks) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(p.t - prev.t) < DEDUPE_SEC) {
      // Keep whichever carries the impact label (impact clustering is the point).
      if (p.phase === 'impact') out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

function tally(picks: FramePick[]): Partial<Record<SwingPhase, number>> {
  const out: Partial<Record<SwingPhase, number>> = {};
  for (const p of picks) out[p.phase] = (out[p.phase] ?? 0) + 1;
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
