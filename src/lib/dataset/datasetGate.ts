// DEV-ONLY (VITE_DEV_PREVIEW) — the dataset extractor's OWN acceptance gate.
//
// WHY A SECOND GATE. Production's `isSwing` (poseSegments.ts) is tuned for ANALYSIS
// quality: a false positive there costs a Vision call and shows the golfer feedback on
// a ball pickup, so it rejects on doubt (ADR-003 Risker §4). Training data has the
// opposite economics — a swing thrown away is a swing nobody can annotate, and frames
// production would refuse to analyse are exactly the awkward ones a shaft detector has
// to survive. So the extractor keeps candidates production discards.
//
// PRODUCTION IS NOT TOUCHED. `isSwing` keeps its thresholds and its verdict; this file
// runs AFTER `detectSessionSwings` and re-examines what it put in `rejected`. Every
// swing carries which gate let it in (`gate`), so the two populations can be measured
// apart once the annotations come back.
//
// WHAT IS LOOSENED
//   - `clippedTail` accepted — a clip that cuts before the finish settles still holds a
//     complete address→impact, which is where the shaft is hardest to see.
//   - envelope duration widened from [0.7, 3.0] to [0.6, 12.0] s.
//   - wrist visibility, the downswing bounds and the cooldown are not applied.
//
// WHAT IS NOT
//   - `envelope.valid` still required — an invalid envelope has no trustworthy
//     [start, finish], so its frame TIMES would be meaningless.
//   - the vertical-excursion floor stays. Hands that never rose is the ball-pickup
//     signature (measured separation is over a decade: swings 0.265+, pickups ≤ 0.019).
//     A picked-up ball is not a swing at any labelling budget.
//   - the peak-speed floor stays — a gesture or a waggle is not training data either.
//
// MULTI-SWING RISK, TAGGED NOT DROPPED. Above production's 3.0 s an envelope may span
// more than one swing. Those run through unchanged and are flagged
// `suspectMultiSwing` so a human can catch them in CVAT, because the alternative —
// splitting them here — would be reimplementing segmentation in the dev layer.
//
// Pure: a session result in, a swing list out. No video, no React, no I/O.

import type { SwingEnvelope } from '../poseEnvelope';
import type { SessionSwings, SwingCandidate } from '../poseSegments';

/** Which acceptance gate let a swing into the dataset. Written per frame. */
export type DatasetGate = 'production' | 'dataset-relaxed';

// ── Mirrored production thresholds ───────────────────────────────────────────
// `MIN_PEAK_SPEED_FRAC`, `MIN_VERTICAL_EXCURSION` and `MAX_ENVELOPE_SEC` are
// module-private in poseSegments.ts, and Ström S may not edit that file — not even to
// add an `export`. They are mirrored here instead of re-invented, and datasetGate.test.ts
// pins each one against the real `isSwing` by bisecting its verdict: change a threshold
// in production and that test fails loudly rather than the dev gate drifting silently.
/** Mirror of poseSegments' `MIN_PEAK_SPEED_FRAC` — segment peak vs session refSpeed. */
export const MIN_PEAK_SPEED_FRAC = 0.4;
/** Mirror of poseSegments' `MIN_VERTICAL_EXCURSION` — `addressY − apexY`, ball-pickup test. */
export const MIN_VERTICAL_EXCURSION = 0.08;
/**
 * Mirror of poseSegments' `MAX_ENVELOPE_SEC`. Not a rejection here — the duration above
 * which an envelope may hold more than one swing, and gets `suspectMultiSwing`.
 */
export const MULTI_SWING_SUSPECT_SEC = 3.0;

// ── The relaxed window ───────────────────────────────────────────────────────
/**
 * Lower bound, seconds. Below production's 0.7 s but not by much: a waggle or a
 * practice flick has no address→finish structure worth annotating, and 0.6 s is about
 * the fastest a real swing envelope measures.
 */
export const DATASET_MIN_ENVELOPE_SEC = 0.6;
/**
 * Upper bound, seconds. Four times production's cap, to keep slow-motion footage —
 * where a 1.5 s swing plays back over 6–10 s and every phase is a gift to an annotator.
 * The bound still exists because an envelope over 12 s is a segmentation failure, not
 * a swing filmed slowly.
 */
export const DATASET_MAX_ENVELOPE_SEC = 12.0;

/** Verdict of the relaxed gate for one envelope. */
export interface DatasetGateResult {
  accepted: boolean;
  /** Why it was accepted or rejected — always filled, always loggable. */
  reason: string;
}

/** One swing the extractor will export, with the gate that admitted it. */
export interface DatasetSwing {
  candidate: SwingCandidate;
  envelope: SwingEnvelope;
  /** Confident impact in clip seconds, or null — polish, never load-bearing (ADR-002). */
  impactSec: number | null;
  gate: DatasetGate;
  /** Envelope longer than `MULTI_SWING_SUSPECT_SEC` — may hold more than one swing. */
  suspectMultiSwing: boolean;
}

/** What `collectDatasetSwings` produces: the export list plus what still fell out. */
export interface DatasetSwingSet {
  /** Both gates' swings, in envelope-start order. `swingIndex` is this array's index. */
  swings: DatasetSwing[];
  /** Candidates neither gate accepted, with the reason the RELAXED gate gave. */
  rejected: { candidate: SwingCandidate; reason: string }[];
}

/**
 * The dataset's own gate. Applied only to candidates production already rejected —
 * anything production accepted is in regardless.
 *
 * @param refSpeed the session's p95 wrist speed, from `segmentSwingCandidates`.
 */
export function passesDatasetGate(envelope: SwingEnvelope, refSpeed: number): DatasetGateResult {
  const no = (reason: string): DatasetGateResult => ({ accepted: false, reason });

  if (!envelope.valid) return no(`envelope invalid (${envelope.reason ?? 'unknown'})`);

  const envSec = envelope.finishSec - envelope.startSec;
  if (envSec < DATASET_MIN_ENVELOPE_SEC) {
    return no(`envelope ${envSec.toFixed(2)}s < ${DATASET_MIN_ENVELOPE_SEC}s (waggle?)`);
  }
  if (envSec > DATASET_MAX_ENVELOPE_SEC) {
    return no(`envelope ${envSec.toFixed(2)}s > ${DATASET_MAX_ENVELOPE_SEC}s (segmentation failure)`);
  }

  if (envelope.peakSpeed < refSpeed * MIN_PEAK_SPEED_FRAC) {
    return no(
      `peak speed ${envelope.peakSpeed.toFixed(2)} < ${MIN_PEAK_SPEED_FRAC}×refSpeed (${(refSpeed * MIN_PEAK_SPEED_FRAC).toFixed(2)}) — gesture?`,
    );
  }

  // Kept from production verbatim: hands that never rose are a ball pickup, and a
  // ball pickup is not a swing however hungry the dataset is.
  const excursion = envelope.addressY - envelope.apexY;
  if (excursion < MIN_VERTICAL_EXCURSION) {
    return no(
      `vertical excursion ${excursion.toFixed(3)} < ${MIN_VERTICAL_EXCURSION} (hands never rose — ball pickup?)`,
    );
  }

  return {
    accepted: true,
    reason: `dataset-relaxed (env ${envSec.toFixed(2)}s, excursion ${excursion.toFixed(3)}${
      envelope.clippedTail ? ', clipped tail' : ''
    })`,
  };
}

/** True when an envelope is long enough to possibly span more than one swing. */
export function isSuspectMultiSwing(envelope: SwingEnvelope): boolean {
  return envelope.finishSec - envelope.startSec > MULTI_SWING_SUSPECT_SEC;
}

/**
 * Merge production's accepted swings with the ones the relaxed gate rescues.
 *
 * Output is sorted by envelope start, so `swingIndex` stays time-ordered within the
 * clip — frame ids are built from it and must not depend on which gate ran first.
 */
export function collectDatasetSwings(session: SessionSwings): DatasetSwingSet {
  const swings: DatasetSwing[] = session.swings.map((s) => ({
    candidate: s.candidate,
    envelope: s.envelope,
    impactSec: s.impactSec,
    gate: 'production' as const,
    suspectMultiSwing: isSuspectMultiSwing(s.envelope),
  }));
  const rejected: DatasetSwingSet['rejected'] = [];

  for (const r of session.rejected) {
    // No envelope at all (segment too short to analyse) — nothing to re-judge.
    if (!r.envelope) {
      rejected.push({ candidate: r.candidate, reason: r.reason });
      continue;
    }
    const verdict = passesDatasetGate(r.envelope, session.refSpeed);
    if (!verdict.accepted) {
      rejected.push({ candidate: r.candidate, reason: verdict.reason });
      continue;
    }
    swings.push({
      candidate: r.candidate,
      envelope: r.envelope,
      impactSec: r.envelope.impact?.timeSec ?? null,
      gate: 'dataset-relaxed',
      suspectMultiSwing: isSuspectMultiSwing(r.envelope),
    });
  }

  swings.sort((a, b) => a.envelope.startSec - b.envelope.startSec);
  return { swings, rejected };
}

/** How many swings each gate contributed, plus how many carry the multi-swing flag. */
export function gateCounts(swings: { gate: DatasetGate; suspectMultiSwing: boolean }[]): {
  production: number;
  relaxed: number;
  suspectMultiSwing: number;
} {
  return {
    production: swings.filter((s) => s.gate === 'production').length,
    relaxed: swings.filter((s) => s.gate === 'dataset-relaxed').length,
    suspectMultiSwing: swings.filter((s) => s.suspectMultiSwing).length,
  };
}
