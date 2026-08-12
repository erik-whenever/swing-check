// DEV-ONLY — cull a swing's selected frames down to the annotation budget, keeping
// the phase mix as close as possible to the spec's target weights.
//
// WHY A CULL AND NOT A SMALLER SELECTION. The extractor runs the PRODUCTION chain
// (`selectEnvelopeFrames` with `ANALYSIS_FRAME_COUNT`), because the dataset has to be
// drawn from the frames production actually sends — a detector trained on a different
// sampling of the swing than the one it will run on is measuring the wrong thing. But
// 32 frames per swing is far more than a human can hand-annotate two points on, so the
// set is cut to 7 AFTERWARDS. The selection stays untouched; only the keep-list shrinks.
//
// WHAT "CLOSEST TO THE TARGET WEIGHTS" MEANS HERE. Frames are dealt out one at a time
// to whichever phase is furthest below its target share and still has frames left
// (Hamilton's method with capacity). That is deterministic, always fills the budget
// when there are enough frames, and degrades sensibly when a phase is empty — its
// share flows to the next-hungriest phase instead of being lost.
//
// Pure: picks in, a subset out. No envelope, no video, no React.

import { SHAFT_PHASES, type ShaftPhase } from './datasetTypes';

/**
 * FRAMES PER SWING that go into the dataset. Seven is an annotation-throughput number,
 * not a detection one: two points per frame, both placed at the streak's midpoint and
 * `blur=severe` frames at ≥ 200 % zoom (docs/shaft/annotation-spec.md), is about a
 * minute of work per frame — so a swing costs ~7 minutes and a 100-frame calibration
 * set is ~15 swings.
 */
export const MAX_FRAMES_PER_SWING = 7;

/**
 * TARGET PHASE WEIGHTS — the distribution the cull aims at, downswing heaviest.
 *
 * The spec's calibration set is "100 frames, weighted towards downswing"; these are
 * that weighting made explicit. The shape follows where shaft detection is HARD rather
 * than where the swing spends time: the downswing and impact are where the shaft is a
 * motion streak whose midpoint has to be judged, and they are also the shortest part
 * of the swing, so a time-uniform sample would under-represent exactly the frames the
 * detector will struggle on. Address and finish are nearly free to annotate (static,
 * sharp club) and get the smallest shares.
 *
 * Sums to 1. Kept in sync with the table in docs/shaft/annotation-spec.md.
 */
export const PHASE_TARGET_WEIGHTS: Record<ShaftPhase, number> = {
  address: 0.08,
  backswing: 0.14,
  top: 0.1,
  downswing: 0.34,
  impact: 0.18,
  through: 0.1,
  finish: 0.06,
};

/** Minimum shape the cull needs: a time and a phase. Extra fields are carried through. */
export interface PhasedPick {
  t: number;
  phase: ShaftPhase;
}

/**
 * Ideal per-phase counts for a budget of `total` frames, before availability is known.
 * Reported in the UI next to what was actually kept.
 */
export function targetCounts(
  total: number,
  weights: Record<ShaftPhase, number> = PHASE_TARGET_WEIGHTS,
): Record<ShaftPhase, number> {
  const available = {} as Record<ShaftPhase, number>;
  for (const p of SHAFT_PHASES) available[p] = total;
  return allocate(total, available, weights);
}

/**
 * Keep at most `max` of `picks`, chosen so the phase distribution sits as close to
 * `weights` as the available frames allow.
 *
 * Returns picks in time order. Fewer picks than `max` are returned unchanged (there is
 * nothing to choose). Never returns more than it was given.
 */
export function cullToPhaseTargets<T extends PhasedPick>(
  picks: T[],
  max: number = MAX_FRAMES_PER_SWING,
  weights: Record<ShaftPhase, number> = PHASE_TARGET_WEIGHTS,
): T[] {
  const byTime = [...picks].sort((a, b) => a.t - b.t);
  if (max <= 0) return [];
  if (byTime.length <= max) return byTime;

  const groups = new Map<ShaftPhase, T[]>();
  for (const p of byTime) {
    const list = groups.get(p.phase);
    if (list) list.push(p);
    else groups.set(p.phase, [p]);
  }

  const available = {} as Record<ShaftPhase, number>;
  for (const p of SHAFT_PHASES) available[p] = groups.get(p)?.length ?? 0;
  const quota = allocate(max, available, weights);

  const kept: T[] = [];
  for (const phase of SHAFT_PHASES) {
    const list = groups.get(phase);
    if (!list) continue;
    kept.push(...spread(list, quota[phase]));
  }
  return kept.sort((a, b) => a.t - b.t);
}

/**
 * Deal `total` units over the phases, one at a time, always to the phase furthest
 * below its ideal share that still has capacity. Ties break in swing order, so the
 * result is fully determined by the inputs.
 */
function allocate(
  total: number,
  available: Record<ShaftPhase, number>,
  weights: Record<ShaftPhase, number>,
): Record<ShaftPhase, number> {
  const sum = SHAFT_PHASES.reduce((acc, p) => acc + Math.max(0, weights[p]), 0);
  const ideal = {} as Record<ShaftPhase, number>;
  const out = {} as Record<ShaftPhase, number>;
  for (const p of SHAFT_PHASES) {
    ideal[p] = sum > 0 ? (total * Math.max(0, weights[p])) / sum : 0;
    out[p] = 0;
  }

  for (let n = 0; n < total; n++) {
    let best: ShaftPhase | null = null;
    let bestDeficit = -Infinity;
    for (const p of SHAFT_PHASES) {
      if (out[p] >= available[p]) continue;
      const deficit = ideal[p] - out[p];
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = p;
      }
    }
    // Every phase is full: the picks simply do not contain `total` frames.
    if (best === null) break;
    out[best]++;
  }
  return out;
}

/**
 * Take `k` of `list` (already in time order), spread evenly across it.
 *
 * Endpoints are included when k ≥ 2 — within a phase the extremes are the informative
 * frames (the first and last downswing frame bracket the fastest shaft motion in the
 * swing), and dropping them would leave a cluster in the middle of a window whose
 * whole point is its span. k = 1 takes the middle as the phase's representative.
 */
function spread<T>(list: T[], k: number): T[] {
  if (k <= 0) return [];
  if (k >= list.length) return [...list];
  if (k === 1) return [list[Math.floor((list.length - 1) / 2)]];
  const out: T[] = [];
  for (let i = 0; i < k; i++) {
    out.push(list[Math.round((i * (list.length - 1)) / (k - 1))]);
  }
  return out;
}

/** Count picks per phase — the numerator of the run summary's distribution. */
export function tallyPhases(picks: PhasedPick[]): Record<ShaftPhase, number> {
  const out = {} as Record<ShaftPhase, number>;
  for (const p of SHAFT_PHASES) out[p] = 0;
  for (const p of picks) out[p.phase]++;
  return out;
}
