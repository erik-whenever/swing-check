// DEV-ONLY (VITE_DEV_PREVIEW) — run the shaft detector over the frames production
// would actually analyse, so the browser's answer can be held against Python's.
//
// THE CHAIN IS PRODUCTION'S, VERBATIM — the same discipline `extractDataset.ts`
// keeps, and for a sharper reason here: the question this view exists to answer is
// "does the model do the same thing in the browser as in `evaluate.py`", and that
// question is only meaningful if the pixels are the same pixels.
//
//   extractPoseTrajectory()                                  (poseTrajectory.ts)
//     → detectSessionSwings()                                (poseSegments.ts)
//       → selectEnvelopeFrames(envelope, ANALYSIS_FRAME_COUNT, …)
//                                                    (poseEnvelopeSelection.ts)
//         → grabFramesAtTimes(quality 0.92, full frame)      (poseFrameGrab.ts)
//           → detectShaft()                                  (shaftDetector.ts)
//
// Production's gate, NOT the dataset one. `extractDataset` deliberately widens
// `isSwing` (clipped tails, long slow-motion reps) because a labelling budget wants
// swings an analysis budget would refuse; this view wants exactly what production
// would send, so it calls `detectSessionSwings` and stops there. It also skips the
// phase cull, which exists only to fit a human annotator's budget.
//
// FULL RESOLUTION, NO CROP — same call shape `extractDataset` uses, for the same
// reason and one more. The annotation set the model trained on was drawn from
// uncropped full-resolution frames, so feeding it a Ström E crop here would measure
// a distribution shift, not the model. Quality 0.92 likewise.
//
// Reads production, writes nothing back: no store, no Vision call, no SwingRecord.
//
// DETECT AT FULL RESOLUTION, KEEP ONLY A THUMBNAIL. Each full-resolution JPEG lives
// exactly as long as its own `detectShaft()` call; what the run returns is a
// ~THUMB_LONG_SIDE px copy. Holding all 26 originals (as base64 in React state and
// as decoded `<img>`s, ~8 MB each at 1080p) blew iOS Safari's per-tab memory on
// IMG_5765.mov — black frames, then a tab reload right after the result painted
// (S-13, 2026-10-22). The detector's input is unchanged by this.

import { ANALYSIS_FRAME_COUNT } from '../frameExtractor';
import { createLogger } from '../logger';
import { grabFramesAtTimes } from '../poseFrameGrab';
import { selectEnvelopeFrames } from '../poseEnvelopeSelection';
import { detectSessionSwings } from '../poseSegments';
import { extractPoseTrajectory } from '../poseTrajectory';
import type { SwingPhase } from '../frameExtractor';
import { detectShaft, loadShaftSession, type ShaftDetection } from './shaftDetector';

const log = createLogger('ShaftPreview');

/** Matches the dataset export — annotation and inference must see the same JPEG. */
const FRAME_QUALITY = 0.92;

/** Long side of the frame the view displays. Detection never sees this size. */
const THUMB_LONG_SIDE = 360;
/** Display-only JPEG, so the dataset's 0.92 has no claim on it. */
const THUMB_QUALITY = 0.8;

export interface PreviewThumb {
  /** Bare base64 JPEG, `width`×`height`. */
  jpegBase64: string;
  width: number;
  height: number;
  /** Thumb px per source px — multiply a detection coordinate by this to draw it. */
  scale: number;
}

export interface PreviewFrame {
  /** Clip-clock second the frame was grabbed at. */
  tSec: number;
  /** The selector's own phase label for this pick. */
  phase: SwingPhase;
  /** Downscaled copy of the frame the detector saw; null if it could not be decoded. */
  thumb: PreviewThumb | null;
  /** Null when the detector threw on this frame; `error` then says why. */
  detection: ShaftDetection | null;
  error?: string;
}

export interface PreviewSwing {
  swingIndex: number;
  envelopeSec: [number, number];
  impactSec: number | null;
  frames: PreviewFrame[];
}

export interface PreviewRun {
  clipName: string;
  poseSamples: number;
  swings: PreviewSwing[];
  /** Candidates the production gate refused, with its reason — a zero-swing clip
   *  has to be diagnosable without opening the log panel. */
  rejected: string[];
  /** Median / mean / min / max of `session.run()` across every frame in the run. */
  timing: TimingSummary | null;
  /** Milliseconds spent building the ONNX session, or 0 if it was already warm. */
  sessionLoadMs: number;
}

export interface TimingSummary {
  frames: number;
  medianMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  /** Median decode + letterbox + tensor fill, for context next to inference. */
  medianPreprocessMs: number;
}

export interface PreviewProgress {
  stage: 'session' | 'pose' | 'grabbing' | 'detecting' | 'done';
  /** 0–1 within the current stage; only pose and detection report intermediates. */
  fraction: number;
  /** Frames detected so far / frames to detect — only during `detecting`. */
  detail?: string;
}

export async function runShaftPreview(
  file: File,
  options: { onProgress?: (p: PreviewProgress) => void; signal?: AbortSignal } = {},
): Promise<PreviewRun> {
  const { onProgress, signal } = options;
  const report = (stage: PreviewProgress['stage'], fraction: number, detail?: string) =>
    onProgress?.({ stage, fraction, detail });

  // Session first, and on its own progress stage: on a cold cache this is a 26 MB
  // download, and a spinner that says "pose" for ninety seconds is a bug report.
  report('session', 0);
  const sessionStart = performance.now();
  await loadShaftSession();
  const sessionLoadMs = Math.round(performance.now() - sessionStart);

  report('pose', 0);
  const samples = await extractPoseTrajectory(file, { onProgress: (f) => report('pose', f) });
  if (signal?.aborted) throw new Error('Aborted');

  const session = detectSessionSwings(samples);
  const swings: PreviewSwing[] = [];
  const allInference: number[] = [];
  const allPreprocess: number[] = [];

  for (const [swingIndex, swing] of session.swings.entries()) {
    if (signal?.aborted) break;
    report('grabbing', swingIndex / Math.max(1, session.swings.length));

    const selection = selectEnvelopeFrames(
      swing.envelope,
      ANALYSIS_FRAME_COUNT,
      swing.candidate.startSec,
      swing.candidate.endSec,
    );
    const { frames: jpegs } = await grabFramesAtTimes(
      file,
      selection.picks.map((p) => p.t),
      FRAME_QUALITY,
      { maxOutputSide: Number.POSITIVE_INFINITY },
    );
    if (signal?.aborted) break;

    const frames: PreviewFrame[] = [];
    for (const [i, pick] of selection.picks.entries()) {
      if (signal?.aborted) break;
      const frame: PreviewFrame = {
        tSec: pick.t,
        phase: pick.phase,
        thumb: null,
        detection: null,
      };
      try {
        // Sequential on purpose. The session is single-threaded WASM, so running
        // these concurrently would interleave nothing and only make the per-frame
        // timing — the number this view is here to report — meaningless.
        frame.detection = await detectShaft(jpegs[i]);
        allInference.push(frame.detection.inferenceMs);
        allPreprocess.push(frame.detection.preprocessMs);
      } catch (err) {
        frame.error = err instanceof Error ? err.message : String(err);
      }
      try {
        frame.thumb = await makeThumb(jpegs[i]);
      } catch (err) {
        frame.error ??= `thumbnail: ${err instanceof Error ? err.message : String(err)}`;
      }
      // Drop the full-resolution original the moment both consumers are done with it.
      jpegs[i] = '';
      frames.push(frame);
      report(
        'detecting',
        (i + 1) / selection.picks.length,
        `swing ${swingIndex + 1}/${session.swings.length} · frame ${i + 1}/${selection.picks.length}`,
      );
      // Yield to the event loop between frames so the overlay paints as it goes;
      // without it a 32-frame swing is one long unresponsive block.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    swings.push({
      swingIndex,
      envelopeSec: [swing.envelope.startSec, swing.envelope.finishSec],
      impactSec: swing.impactSec,
      frames,
    });
  }

  const timing = summarise(allInference, allPreprocess);
  // WARN so it lands in the in-app log panel — this runs on a phone, where the
  // console is not reachable and this number is the whole point of the exercise.
  log.warn('Shaft preview finished', {
    clipName: file.name,
    poseSamples: samples.length,
    swings: swings.length,
    frames: allInference.length,
    sessionLoadMs,
    inferenceMs: timing
      ? { median: timing.medianMs, mean: timing.meanMs, min: timing.minMs, max: timing.maxMs }
      : null,
    medianPreprocessMs: timing?.medianPreprocessMs ?? null,
  });

  return {
    clipName: file.name,
    poseSamples: samples.length,
    swings,
    rejected: session.rejected.map(
      (r) => `[${r.candidate.startSec.toFixed(2)}–${r.candidate.endSec.toFixed(2)}] ${r.reason}`,
    ),
    timing,
    sessionLoadMs,
  };
}

/**
 * Full-resolution JPEG → ~THUMB_LONG_SIDE px JPEG. The decoded bitmap and the canvas
 * are released explicitly rather than left to GC: iOS counts canvas backing stores
 * against a hard budget and reclaims them late, which is the failure this exists for.
 */
async function makeThumb(jpegBase64: string): Promise<PreviewThumb> {
  const blob = await (await fetch(`data:image/jpeg;base64,${jpegBase64}`)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, THUMB_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      jpegBase64: canvas.toDataURL('image/jpeg', THUMB_QUALITY).split(',')[1],
      width: canvas.width,
      height: canvas.height,
      // Per-axis rounding makes x and y scale differ by < 1 thumb px; one factor is
      // what the overlay needs, and the error is below a dot's radius.
      scale: canvas.width / bitmap.width,
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Shaft direction in degrees, `butt → hosel`, or null when an end is missing. */
export function shaftAngleDeg(detection: ShaftDetection | null): number | null {
  return directionDeg(detection?.butt ?? null, detection?.hosel ?? null);
}

/**
 * Blade direction in degrees, `heel → toe`, or null when an end is missing.
 *
 * A separate number from `shaftAngleDeg`, never averaged with it: the shaft can be in
 * the right plane with the blade wide open, and that is precisely the error the sole
 * points were added to make visible. Null on every frame under a 2-point model —
 * `detection.modelKeypoints` says which of the two cases a null is.
 */
export function bladeAngleDeg(detection: ShaftDetection | null): number | null {
  return directionDeg(detection?.heel ?? null, detection?.toe ?? null);
}

function directionDeg(
  from: { x: number; y: number } | null,
  to: { x: number; y: number } | null,
): number | null {
  if (!from || !to) return null;
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function summarise(inference: number[], preprocess: number[]): TimingSummary | null {
  if (inference.length === 0) return null;
  return {
    frames: inference.length,
    medianMs: round1(median(inference)),
    meanMs: round1(inference.reduce((a, b) => a + b, 0) / inference.length),
    minMs: round1(Math.min(...inference)),
    maxMs: round1(Math.max(...inference)),
    medianPreprocessMs: round1(median(preprocess)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
