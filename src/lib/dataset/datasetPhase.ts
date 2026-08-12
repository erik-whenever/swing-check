// DEV-ONLY — derive the annotation spec's 7-value `phase` from a swing envelope.
//
// `selectEnvelopeFrames` already labels every pick with a `SwingPhase`, but that is a
// 6-value set built for the Vision prompt, and it is deliberately COARSE: everything
// after impact is `follow-through`. The annotation spec wants `through` and `finish`
// kept apart (docs/shaft/annotation-spec.md → Frame-attribut), because a shaft in
// mid-follow-through is a motion streak and a shaft at the finish is a static line —
// different annotation problems, and the phase attribute is what lets the calibration
// set be weighted between them.
//
// So the phase is derived HERE, from the same envelope the selection used, rather than
// by widening `SwingPhase` — which would mean editing poseEnvelopeSelection.ts, a file
// this work is not allowed to touch and which production depends on.
//
// Pure: an envelope and a time in, a phase out.

import type { SwingEnvelope } from '../poseEnvelope';
import type { ShaftPhase } from './datasetTypes';

// ── Tunables ─────────────────────────────────────────────────────────────────
/**
 * Half-width (seconds) of the `address`, `top` and `impact` windows. These three are
 * POINT events in the envelope, so a frame is one of them only if it sits close to
 * the landmark; everything else falls to the span phases around it. Floored on the
 * envelope's own `sampleDt` at call time — the landmarks were located by 15 fps pose
 * sampling, so claiming tighter precision than that would be fiction.
 */
const POINT_TOL_SEC = 0.06;
/**
 * Split of the post-impact span between `through` and `finish`. The last 30 % of
 * [impact, finish] is the settle — the envelope's finish is defined as the point the
 * hands stop rising and hold, so the run-up to it is where the club is still swinging.
 */
const FINISH_TAIL_FRAC = 0.3;

/**
 * NO-IMPACT FALLBACK — fractions of [start, finish] for each phase boundary.
 *
 * Used only when the envelope carries no confident impact, which is exactly when
 * `selectEnvelopeFrames` also falls back to a uniform baseline (ADR-002: impact is
 * polish, never load-bearing). Without impact and top there is nothing to anchor on,
 * so these are the SHAPE of a typical swing and nothing more — roughly a 1.6 s
 * envelope with a 0.8 s backswing, a 0.25 s downswing and a 0.5 s follow-through.
 *
 * They are approximate BY CONSTRUCTION, and that is fine for the dataset: `phase` is
 * an annotation attribute used to weight the set, not a label anything is trained
 * against. The annotator sees the frame and can correct it in CVAT.
 */
const FALLBACK_BOUNDS: { until: number; phase: ShaftPhase }[] = [
  { until: 0.03, phase: 'address' },
  { until: 0.45, phase: 'backswing' },
  { until: 0.52, phase: 'top' },
  { until: 0.68, phase: 'downswing' },
  { until: 0.73, phase: 'impact' },
  { until: 0.9, phase: 'through' },
  { until: Infinity, phase: 'finish' },
];

/**
 * Phase of the frame grabbed at `tSec`, within `envelope`.
 *
 * Times outside the envelope are clamped to its ends rather than rejected: a cluster
 * pick can land a few milliseconds past `finishSec`, and "just past the finish" is a
 * finish frame, not an error.
 */
export function derivePhase(tSec: number, envelope: SwingEnvelope): ShaftPhase {
  const start = envelope.startSec;
  const finish = envelope.finishSec > start ? envelope.finishSec : start;
  const tol = Math.max(POINT_TOL_SEC, envelope.sampleDt);
  const t = Math.min(finish, Math.max(start, tSec));

  if (t <= start + tol) return 'address';

  const impact = envelope.impact;
  if (!impact) {
    const span = finish - start;
    const f = span > 0 ? (t - start) / span : 1;
    return FALLBACK_BOUNDS.find((b) => f < b.until)!.phase;
  }

  if (Math.abs(t - impact.timeSec) <= tol) return 'impact';
  if (Math.abs(t - impact.topSec) <= tol) return 'top';
  if (t < impact.topSec) return 'backswing';
  if (t < impact.timeSec) return 'downswing';

  // Post-impact: `through` while the club is still travelling, `finish` in the settle.
  const tail = finish - impact.timeSec;
  if (tail <= 0) return 'finish';
  return t >= finish - tail * FINISH_TAIL_FRAC ? 'finish' : 'through';
}
