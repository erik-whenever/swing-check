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
//   impact, reallocate a share of the budget into tight clusters, keeping the rest
//   as uniform baseline (so address + finish stay covered). If impact is not
//   confident we keep the pure baseline — a VALID good outcome, not a
//   fallback-to-garbage. `impactClusterApplied` reports which happened.
//
//   WHERE THE CLUSTERS GO IS NOW THE CALLER'S CALL (2026-08-11). The cluster used
//   to sit on impact, unconditionally. That is right for a rule about the strike
//   and wrong for every rule that is decided elsewhere: a rule about downswing
//   SEQUENCING — whether the hips start rotating before the shoulders — plays out
//   in the top→downswing transition, where an impact-centred cluster puts almost
//   no frames. Production returned `cannot_determine` on exactly such a rule. So
//   `options.clusterPhases` lets the caller say which phases the active rules
//   actually look at, and the cluster budget is split evenly across them, each
//   centred on that phase's midpoint in this envelope.
//
//   Passing nothing keeps the old behaviour EXACTLY (cluster on impact when impact
//   is confident). That is the baseline and it must not be able to collapse —
//   worst-case-wins. The clip path passes nothing.
//
// Pure + testable: timestamps in, timestamps out. Frame grabbing lives in
// poseFrameGrab.ts. Selection signal only — it takes a list of phases, never rules.
//
// If the envelope itself is not usable (`valid === false`), we fall back to Pass
// 1's even distribution across the pose sample span and flag it.

import type { SwingPhase } from './frameExtractor';
import type { SwingEnvelope } from './poseEnvelope';

// ── Tunables ─────────────────────────────────────────────────────────────────
/**
 * CLUSTER BUDGET SHARE. Fraction of the frame budget reallocated into the phase
 * cluster(s). The rest stays uniform over the envelope, so address + finish keep
 * coverage. 0.4 → ~13 of 32 frames clustered, split across the phases asked for.
 */
const IMPACT_CLUSTER_BUDGET_FRAC = 0.4;
/** The clustered part is at least this many frames when applied. */
const IMPACT_CLUSTER_MIN_FRAMES = 2;
/**
 * CLUSTER SPACING (seconds). How tightly frames pack around a phase centre.
 *
 * Lowered 0.06 → 0.033 (2026-08-11), and the `max(…, envelope.sampleDt)` floor
 * REMOVED. The floor conflated two different clocks: the placement is DERIVED from
 * pose (15 fps → dt 0.067), but the grab happens against the VIDEO, which is
 * recorded at 30 fps. Flooring on `sampleDt` therefore threw away half the source's
 * time resolution for no reason — we were spacing at the resolution we located the
 * swing with, not the resolution we can actually sample it at. 0.033 ≈ one 30 fps
 * video frame, which is the real floor; anything tighter would grab the same source
 * frame twice (and `DEDUPE_SEC` catches that anyway).
 */
const IMPACT_CLUSTER_SPACING_SEC = 0.033;
/**
 * PHASE-LABEL TOLERANCE (seconds). Deliberately NOT the cluster spacing, though it
 * used to be the same number. Labelling asks "is this frame at the top?", and how
 * precisely that can be answered is bounded by the POSE sampling that found the
 * landmark — so this one keeps the `sampleDt` floor that spacing just lost.
 */
const PHASE_LABEL_TOL_SEC = 0.06;
/** Merge picks closer than this (avoids grabbing the same source frame twice). */
const DEDUPE_SEC = 0.03;

/** Swing order — cluster phases are normalized into this, whatever order they arrive in. */
const PHASE_ORDER: SwingPhase[] = [
  'address',
  'backswing',
  'top',
  'downswing',
  'impact',
  'follow-through',
];

export interface FramePick {
  t: number;
  phase: SwingPhase;
}

export interface EnvelopeSelectionOptions {
  /**
   * Phases the active rules actually examine. The cluster budget is split evenly
   * across the distinct, locatable ones. Empty/omitted → cluster on impact, i.e.
   * the pre-2026-08-11 behaviour, unchanged.
   */
  clusterPhases?: SwingPhase[];
}

export interface EnvelopeSelection {
  /** The budget asked for. Compare with `picks.length` to see what dedupe cost. */
  requested: number;
  picks: FramePick[];
  /** Frames actually allocated per phase label (after dedupe). */
  allocation: Partial<Record<SwingPhase, number>>;
  /** Phases that actually received a cluster, in swing order. Empty when none did. */
  clusterPhases: SwingPhase[];
  /** Frames placed per cluster phase BEFORE dedupe — the intent, next to the result. */
  clusterAllocation: Partial<Record<SwingPhase, number>>;
  /** True when the envelope (not the even-over-span fallback) drove selection. */
  usedEnvelope: boolean;
  /** True when we fell back to even distribution (inverse of the above). */
  fellBackToEven: boolean;
  /** True when a cluster was layered on the uniform baseline (any phase, not only impact). */
  impactClusterApplied: boolean;
  /** The swing envelope (boundaries + impact + diagnostics) for verification. */
  envelope: SwingEnvelope;
  reason?: string;
}

/**
 * Allocate `budget` frames over the swing. Uniform-in-time across the envelope is
 * the baseline; a confident impact adds tight clusters on top, on impact by default
 * or on `options.clusterPhases` when the caller names them. Falls back to even
 * distribution across [spanStart, spanEnd] when the envelope is not usable.
 */
export function selectEnvelopeFrames(
  envelope: SwingEnvelope,
  budget: number,
  spanStart: number,
  spanEnd: number,
  options?: EnvelopeSelectionOptions,
): EnvelopeSelection {
  if (budget <= 0) {
    return {
      requested: budget,
      picks: [],
      allocation: {},
      clusterPhases: [],
      clusterAllocation: {},
      usedEnvelope: false,
      fellBackToEven: false,
      impactClusterApplied: false,
      envelope,
    };
  }

  // No usable envelope → even over the whole pose span, flagged.
  if (!envelope.valid) {
    return {
      requested: budget,
      ...evenFallback(budget, spanStart, spanEnd),
      clusterPhases: [],
      clusterAllocation: {},
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

  const spacing = IMPACT_CLUSTER_SPACING_SEC;
  const tol = Math.max(PHASE_LABEL_TOL_SEC, envelope.sampleDt);

  // Which phases get a cluster, and where each one sits in THIS envelope. A phase
  // whose centre cannot be located (everything interior, without a confident
  // impact) is dropped here rather than guessed at.
  const centres = resolveClusterCentres(options?.clusterPhases, envelope, finish);

  let picks: FramePick[];
  const clusterAllocation: Partial<Record<SwingPhase, number>> = {};

  if (centres.length > 0) {
    // STEG 3: cluster part of the budget, keep the remainder as uniform baseline
    // (address + finish stay covered no matter which phases were asked for).
    const clusterCount = clamp(
      Math.round(budget * IMPACT_CLUSTER_BUDGET_FRAC),
      Math.max(IMPACT_CLUSTER_MIN_FRAMES, Math.min(centres.length, budget - 2)),
      Math.max(IMPACT_CLUSTER_MIN_FRAMES, budget - 2),
    );
    const baselineCount = budget - clusterCount;
    const per = splitEvenly(clusterCount, centres.length);

    const raw: number[] = [...uniform(fittable(baselineCount, start, finish), start, finish)];
    centres.forEach((c, i) => {
      if (per[i] <= 0) return;
      clusterAllocation[c.phase] = per[i];
      raw.push(...cluster(c.t, per[i], spacing));
    });

    picks = raw
      .map((t) => clamp(t, start, finish))
      .sort((a, b) => a - b)
      .map((t) => ({ t, phase: labelPhase(t, envelope, tol) }));
  } else {
    // STEG 2: pure uniform-in-time baseline over the envelope.
    picks = uniform(fittable(budget, start, finish), start, finish).map((t) => ({
      t,
      phase: labelPhase(t, envelope, tol),
    }));
  }

  const clusterPhases = centres.map((c) => c.phase).filter((p) => clusterAllocation[p]);
  const deduped = dedupe(picks, new Set(clusterPhases));
  return {
    requested: budget,
    picks: deduped,
    allocation: tally(deduped),
    clusterPhases,
    clusterAllocation,
    usedEnvelope: true,
    fellBackToEven: false,
    impactClusterApplied: clusterPhases.length > 0,
    envelope,
  };
}

/**
 * Turn the requested phases into `{phase, t}` centres in this envelope, in swing
 * order, deduplicated, dropping any that cannot be located.
 *
 * WITH NO REQUEST this returns the impact centre when impact is confident and
 * nothing otherwise — bit for bit the old behaviour, which is the point: every
 * caller that does not opt in keeps the selection it was verified with.
 */
function resolveClusterCentres(
  requested: SwingPhase[] | undefined,
  env: SwingEnvelope,
  finish: number,
): { phase: SwingPhase; t: number }[] {
  const wanted =
    requested && requested.length > 0
      ? PHASE_ORDER.filter((p) => requested.includes(p))
      : (['impact'] as SwingPhase[]);

  const out: { phase: SwingPhase; t: number }[] = [];
  for (const phase of wanted) {
    const t = phaseCentre(phase, env, finish);
    if (t !== null) out.push({ phase, t });
  }
  return out;
}

/**
 * Midpoint of a phase within this envelope, or null when it is not locatable.
 *
 * Everything interior is defined relative to the confident impact and the backswing
 * top it carries, so WITHOUT a confident impact only `address` has a real position.
 * Returning null rather than a fraction-of-the-envelope guess is deliberate: a
 * cluster placed on a guessed centre spends 40 % of the budget on a time that may
 * be nowhere near the phase, which is worse than the uniform baseline it replaced.
 */
function phaseCentre(
  phase: SwingPhase,
  env: SwingEnvelope,
  finish: number,
): number | null {
  if (phase === 'address') return env.startSec;
  const impact = env.impact;
  if (!impact) return null;
  switch (phase) {
    case 'backswing':
      return (env.startSec + impact.topSec) / 2;
    case 'top':
      return impact.topSec;
    // The transition this whole change exists for: the middle of the downswing,
    // bounded by the top on one side and impact on the other.
    case 'downswing':
      return (impact.topSec + impact.timeSec) / 2;
    case 'impact':
      return impact.timeSec;
    case 'follow-through':
      return (impact.timeSec + finish) / 2;
  }
}

/** Split `total` frames over `parts` centres as evenly as possible, biggest first. */
function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Cap a uniform count at what [a, b] can actually hold at `DEDUPE_SEC` resolution.
 *
 * Needed because greedy dedupe is not monotone in the budget: it merges against the
 * last KEPT pick, so an over-dense grid of spacing g ∈ [DEDUPE_SEC/2, DEDUPE_SEC)
 * collapses to every OTHER pick — final spacing 2g, well past the limit. Measured on
 * the `dtl-clipped` fixture (~0.6 s envelope): budget 20 → 20 frames, budget 32 → 16.
 * Raising the budget lost frames. Asking only for what fits removes the effect and
 * costs nothing, since the surplus picks were never going to survive; the envelope
 * simply does not contain more distinct source frames.
 */
function fittable(n: number, a: number, b: number): number {
  const span = b - a;
  if (span <= 0) return Math.min(n, 1);
  let fit = Math.min(n, Math.floor(span / DEDUPE_SEC) + 1);
  // The grid's spacing must clear DEDUPE_SEC with room to spare, or the uniform pass
  // hands dedupe a grid it immediately merges. `span / DEDUPE_SEC` landing on (or a
  // float hair above) a whole number is precisely that case, and float error in the
  // per-pick arithmetic decides it either way — hence a margin, not `>=`.
  while (fit > 2 && span / (fit - 1) <= DEDUPE_SEC * (1 + 1e-6)) fit--;
  return Math.max(1, fit);
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

function dedupe(picks: FramePick[], clustered: Set<SwingPhase>): FramePick[] {
  const out: FramePick[] = [];
  for (const p of picks) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(p.t - prev.t) < DEDUPE_SEC) {
      // Keep whichever carries a clustered label — the cluster is the point of the
      // reallocation, so a baseline pick is the one to lose when they collide.
      if (clustered.has(p.phase) && !clustered.has(prev.phase)) out[out.length - 1] = p;
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
