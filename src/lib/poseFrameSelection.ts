// STEG 2 + 3 (Ström D, Pass 2) — Phase-weighted frame allocation.
//
// Given a frame budget B and the wrist-derived phase boundaries (posePhases.ts),
// pick B timestamps with the density concentrated around impact instead of the
// even spacing Pass 1 uses. Address is near-static (one reference frame is
// enough); downswing→impact→early follow-through is the fastest, most
// information-dense window and earns the most frames.
//
// Pure + testable: takes timestamps in, returns timestamps out. The actual frame
// grabbing lives in poseFrameGrab.ts. Selection signal only — no rules.
//
// If the phase read is not confident, we fall back to Pass 1's even distribution
// (across the pose sample span) and flag it, rather than emit garbage.

import type { SwingPhase } from './frameExtractor';
import type { PoseSwingPhases } from './posePhases';

// ── Tunable phase weights (frames per phase, before impact gets the leftover) ──
// impact is deliberately NOT listed: it absorbs whatever the budget leaves after
// the others, floored at IMPACT_MIN_FRAMES, so raising the budget flows straight
// into tighter impact coverage. To bias harder toward impact, trim these.
export const PHASE_WEIGHTS: Record<
  'address' | 'backswing' | 'top' | 'downswing' | 'followThrough',
  number
> = {
  address: 1,
  backswing: 2,
  top: 1,
  downswing: 2,
  followThrough: 1,
};
/** Impact always gets at least this many frames, taken tightest around impact. */
const IMPACT_MIN_FRAMES = 2;
/** Hard floor on spacing near impact — source is ~16 fps, so ~0.06 s is finest. */
const MIN_FRAME_SPACING_SEC = 0.06;
/** Merge picks closer than this (avoids grabbing the same source frame twice). */
const DEDUPE_SEC = 0.03;
/**
 * If top → impact is shorter than this, the phase read has collapsed (top,
 * impact and follow-through pile onto one instant). The per-phase windows are
 * then meaningless — a proportional split would starve the zero-width impact/top
 * windows to nothing. We refuse them entirely and fall back to uniform-in-time.
 */
const DEGENERATE_DOWNSWING_SEC = 0.12;

export interface FramePick {
  t: number;
  phase: SwingPhase;
}

export interface PhaseWeightedSelection {
  picks: FramePick[];
  /** Frames actually allocated per phase (after dedupe). */
  allocation: Partial<Record<SwingPhase, number>>;
  /** True when the phase-weighted heuristic drove selection. */
  usedPhaseWeighting: boolean;
  /** True when we fell back to even distribution (inverse of the above). */
  fellBackToEven: boolean;
  /** The wrist-derived phase read (boundaries + confidence) for verification. */
  phases: PoseSwingPhases;
  reason?: string;
}

/**
 * Allocate `budget` frames across the swing, clustered around impact. Falls back
 * to even distribution across [spanStart, spanEnd] when `phases` is not
 * confident.
 */
export function selectPhaseWeightedFrames(
  phases: PoseSwingPhases,
  budget: number,
  spanStart: number,
  spanEnd: number,
): PhaseWeightedSelection {
  // Fall back when the read is untrusted OR the top→impact window has collapsed.
  // Either way the phase windows are unusable, so we THROW THEM OUT and spread
  // the budget UNIFORMLY IN TIME over the swing window — never over the (possibly
  // zero-width) phase windows. Even spacing over the active window is guaranteed
  // to sample the impact region, which is the whole point of the fallback.
  const degenerate = phases.impact - phases.top < DEGENERATE_DOWNSWING_SEC;
  if (!phases.confident || degenerate) {
    // Prefer [backswingStart, spanEnd] to skip the dead pre-swing address hold
    // (which would otherwise waste half the budget on a static setup). Use the
    // full span only when backswingStart isn't a usable interior time.
    const bs = phases.backswingStart;
    const winStart = bs > spanStart && bs < spanEnd ? bs : spanStart;
    return {
      ...evenFallback(budget, winStart, spanEnd),
      usedPhaseWeighting: false,
      fellBackToEven: true,
      phases,
      reason:
        phases.reason ??
        (degenerate ? 'degenerate top→impact window' : 'pose phases not confident'),
    };
  }

  const { addressRef, backswingStart, top, impact, followThroughStart } = phases;

  // Frame counts: fixed weights for everything but impact, which gets the rest.
  const w = PHASE_WEIGHTS;
  const others = w.address + w.backswing + w.top + w.downswing + w.followThrough;
  const impactCount = Math.max(IMPACT_MIN_FRAMES, budget - others);

  const spacing = Math.max(MIN_FRAME_SPACING_SEC, phases.sampleDt);
  const picks: FramePick[] = [];

  // address — one reference frame at the setup hold.
  for (const t of spread(addressRef, addressRef, w.address)) {
    picks.push({ t, phase: 'address' });
  }
  // backswing — between motion onset and the top.
  for (const t of spread(backswingStart, top, w.backswing, 'interior')) {
    picks.push({ t, phase: 'backswing' });
  }
  // top — the apex.
  for (const t of spread(top, top, w.top)) {
    picks.push({ t, phase: 'top' });
  }
  // downswing — top → impact, the accelerating stretch.
  for (const t of spread(top, impact, w.downswing, 'interior')) {
    picks.push({ t, phase: 'downswing' });
  }
  // impact — a tight cluster centred on the detected impact, at source-fps spacing.
  for (const t of cluster(impact, impactCount, spacing)) {
    picks.push({ t, phase: 'impact' });
  }
  // early follow-through — just after impact.
  const ftEnd = Math.max(followThroughStart, Math.min(spanEnd, impact + 6 * spacing));
  for (const t of spread(followThroughStart, ftEnd, w.followThrough, 'interior')) {
    picks.push({ t, phase: 'follow-through' });
  }

  // Clamp into range, sort, dedupe near-identical times (keeps the impact label
  // when a cluster frame collides with a neighbouring phase).
  const clamped = picks
    .map((p) => ({ ...p, t: clamp(p.t, spanStart, spanEnd) }))
    .sort((a, b) => a.t - b.t);
  const deduped = dedupe(clamped);

  return {
    picks: deduped,
    allocation: tally(deduped),
    usedPhaseWeighting: true,
    fellBackToEven: false,
    phases,
  };
}

function evenFallback(
  budget: number,
  start: number,
  end: number,
): Pick<PhaseWeightedSelection, 'picks' | 'allocation'> {
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

/**
 * `n` evenly spaced times in [a, b]. mode 'interior' places them at the interior
 * fractions (k+1)/(n+1) so they don't sit exactly on the phase boundaries (which
 * belong to neighbouring phases). Degenerate a===b returns n copies of a.
 */
function spread(a: number, b: number, n: number, mode: 'endpoint' | 'interior' = 'endpoint'): number[] {
  if (n <= 0) return [];
  if (a === b) return new Array(n).fill(a);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f =
      mode === 'interior'
        ? (i + 1) / (n + 1)
        : n === 1
          ? 0.5
          : i / (n - 1);
    out.push(a + (b - a) * f);
  }
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
