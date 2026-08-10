// INCREMENTAL swing detection over a sliding window (ADR-003 §4, D-5 pass 2).
//
// The clip path runs `detectSessionSwings` ONCE over a finished clip. Live, the same
// chain runs repeatedly over a ring buffer that keeps sliding, which introduces one
// problem the clip path never had: the SAME physical swing is re-detected on every
// pass for as long as it stays inside the window. Turning "swings currently visible"
// into "swings newly detected" is the entire job of this file.
//
// The detection chain itself is untouched — `detectSessionSwings` in, filtering out.
// poseSegments.ts and poseEnvelope.ts are not modified by the live path in any way,
// which is what makes the live results comparable with the clip results and with the
// frozen fixtures.
//
// WHY A SWING ARRIVES LATE, and why that is correct. `isSwing` rejects `clippedTail`
// — motion without a settled finish. A swing therefore becomes detectable only once
// its follow-through has been held long enough to settle (FINISH_MIN_HOLD_FRAMES),
// i.e. roughly a second after impact. That lag is reported as `latencySec` rather than
// engineered away: detecting earlier would mean accepting swings whose finish has not
// happened yet, which is exactly the failure ADR-002's clip-cutoff protection exists
// to prevent.
//
// Pure: samples in, reports out. No pose, no timers, no React — unit-testable.

import { computeLandmarkBounds, type LandmarkBounds } from './poseCropBox';
import type { SwingEnvelope } from './poseEnvelope';
import { detectSessionSwings } from './poseSegments';
import type { PoseSample } from './poseTrajectory';

/**
 * REPORT COOLDOWN (seconds). Mirrors `COOLDOWN_SEC` in poseSegments.ts, for the same
 * physical reason: nobody hits two balls less than two seconds apart, so two accepted
 * anchors closer than this are the same swing seen twice.
 *
 * It has to absorb ANCHOR DRIFT as well as re-detection. As the window slides, the
 * segment padding around a swing changes slightly, so the same swing can come back
 * with an anchor a frame or two away from last time. A tolerance of a few frames would
 * be enough for drift alone; two seconds is chosen to match the gate so the live path
 * and the clip path cannot disagree about what counts as one swing.
 */
const REPORT_COOLDOWN_SEC = 2.0;

/** One newly detected swing, in the live loop's clock (seconds since loop start). */
export interface LiveSwingReport {
  /** 1-based, in detection order — the number shown in the dev counter. */
  index: number;
  envelopeSec: [number, number];
  /** Null when impact was not confidently found (ADR-002: impact is polish). */
  impactSec: number | null;
  downswingSec: number | null;
  /** `addressY − apexY` — how far the hands rose. The ball-pickup discriminator. */
  excursion: number;
  /** Impact when present, else envelope start. Ordering + dedupe use this. */
  anchorSec: number;
  peakSpeed: number;
  /** Loop clock when the swing was reported. */
  detectedAtSec: number;
  /** `detectedAtSec − anchorSec` — how long after the swing the detection landed. */
  latencySec: number;
  /**
   * The envelope this swing was accepted on, verbatim from `detectSwingEnvelope`.
   *
   * Carried so the capture path (D-5 pass 3) can run the SAME
   * `selectEnvelopeFrames` allocation the clip path runs, instead of re-deriving an
   * approximation from `envelopeSec`/`impactSec`. Frame selection quality then does
   * not depend on which path captured the swing.
   */
  envelope: SwingEnvelope;
  /**
   * Union of every usable landmark over the envelope, normalized — the crop box for
   * this swing's analysis frames (Ström E). Null when there was nothing usable to
   * build one from, which the grab path reads as "send the whole frame".
   *
   * Four numbers, deliberately, not the samples they came from: a session holds every
   * report for its whole run, and carrying landmark arrays along would undo the ring
   * buffer's constant-memory bound.
   */
  cropBounds: LandmarkBounds | null;
}

export interface LiveDetectionRun {
  /** Swings that had not been reported before this run. Usually empty. */
  reports: LiveSwingReport[];
  /** Cost of the whole chain over the current window, milliseconds. */
  detectMs: number;
  /** Segmentation output for the window — diagnostics, not decisions. */
  candidates: number;
  rejected: number;
  /** Swings the chain sees in the window right now, new or already reported. */
  visible: number;
  windowSamples: number;
  refSpeed: number;
}

export class LiveSwingDetector {
  private readonly cooldownSec: number;
  private lastAnchorSec = Number.NEGATIVE_INFINITY;
  private reported = 0;
  private lastDetectMs = 0;

  constructor(options?: { reportCooldownSec?: number }) {
    this.cooldownSec = options?.reportCooldownSec ?? REPORT_COOLDOWN_SEC;
  }

  /**
   * Run the ADR-003 chain over the current window and return only the swings that are
   * new since the last call.
   *
   * @param samples the ring buffer contents, chronological.
   * @param nowSec the live loop's clock, for latency reporting.
   */
  run(samples: PoseSample[], nowSec: number): LiveDetectionRun {
    const t0 = performance.now();
    const session = detectSessionSwings(samples);
    const detectMs = performance.now() - t0;
    this.lastDetectMs = detectMs;

    const reports: LiveSwingReport[] = [];
    for (const swing of session.swings) {
      // `detectSessionSwings` already orders swings by anchor and applies its own
      // cooldown WITHIN a window; this second test is about crossing windows.
      if (swing.anchorSec <= this.lastAnchorSec + this.cooldownSec) continue;
      this.lastAnchorSec = swing.anchorSec;
      this.reported++;
      const e = swing.envelope;
      reports.push({
        index: this.reported,
        envelopeSec: [e.startSec, e.finishSec],
        impactSec: swing.impactSec,
        downswingSec: e.impact?.downswingSec ?? null,
        excursion: e.addressY - e.apexY,
        anchorSec: swing.anchorSec,
        peakSpeed: e.peakSpeed,
        detectedAtSec: nowSec,
        latencySec: nowSec - swing.anchorSec,
        envelope: e,
        // Computed here, where the samples still exist. The window is the envelope
        // itself: the frames that get sent all come from inside it, so landmarks from
        // the padding around it would only inflate the box.
        cropBounds: computeLandmarkBounds(samples, e.startSec, e.finishSec),
      });
    }

    return {
      reports,
      detectMs,
      candidates: session.segmentation.candidates.length,
      rejected: session.rejected.length,
      visible: session.swings.length,
      windowSamples: samples.length,
      refSpeed: session.refSpeed,
    };
  }

  /** Number of swings reported since the last reset. */
  get count(): number {
    return this.reported;
  }

  get lastRunMs(): number {
    return this.lastDetectMs;
  }

  reset(): void {
    this.lastAnchorSec = Number.NEGATIVE_INFINITY;
    this.reported = 0;
    this.lastDetectMs = 0;
  }
}
