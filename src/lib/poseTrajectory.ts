// Run PoseLandmarker across a swing video and return a time series of body
// landmarks. This mirrors frameExtractor.ts's seek-and-grab pattern (a hidden
// <video> we seek frame-by-frame) but feeds each frame to MediaPipe instead of
// diffing pixels. No phase detection here — just the raw trajectory that later
// passes will analyse.

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { getPoseLandmarker, resetPoseLandmarker } from './poseDetector';
import { createLogger } from './logger';

const log = createLogger('PoseTrajectory');

// Sampling rate for pose inference. 15 fps is dense enough to follow a golf
// swing while keeping the number of (relatively expensive) inferences bounded.
const SAMPLE_FPS = 15;
/**
 * MAX ANALYSIS SECONDS — the work cap is on analysed DURATION, not on sample count.
 *
 * This replaces a fixed `MAX_SAMPLES = 240`, which capped the TOTAL number of samples
 * and therefore silently traded away the SAMPLING RATE on long clips: a 3-minute clip
 * got 240 samples spread over 180 s ≈ 1.3 Hz, so a whole golf swing (~1.5 s) landed on
 * 1–2 samples and `detectSwingEnvelope` had nothing to read. The old cap started biting
 * at 16 s — i.e. exactly in the "long setup" scenario that motivated the pose work in
 * the first place (see docs/reviews/ARCHITECTURE_REVIEW_2026-07.md and
 * docs/decisions/ADR-003-draft.md §3).
 *
 * Capping duration instead keeps the rate pinned at SAMPLE_FPS for every clip length,
 * which is what the detector actually depends on. Beyond the cap we TRUNCATE (analyse
 * the first MAX_ANALYSIS_SEC) and log it loudly, rather than thinning the whole clip:
 * silent down-sampling is the precise failure mode being removed here, and a quiet
 * degradation that still reports success is worse than a loud, bounded one.
 *
 * 300 s covers the 2–4 minute multi-swing session clips being collected for the
 * segmentation work (ADR-003) with headroom.
 * OSÄKER: at the cap this is ~4500 inferences (~2–5 min of work on a CPU delegate).
 * That is a deliberate cost trade for usable fixtures; if a long UPLOAD ever needs to
 * stay snappy, gate the pose path on duration in frameExtractor rather than lowering
 * this (lowering it brings back the rate loss).
 */
const MAX_ANALYSIS_SEC = 300;

export interface PoseSample {
  /** Timestamp in seconds (relative to the start of the clip). */
  t: number;
  /** All 33 MediaPipe pose landmarks, or [] if no pose was detected. */
  landmarks: NormalizedLandmark[];
}

// TIMELINE — per extraction, starting at 0.
//
// detectForVideo in VIDEO mode demands strictly increasing timestamps for the lifetime
// of a PoseLandmarker INSTANCE. This used to be handled with a module-scope
// `lastGlobalTsMs` that kept growing across clips, because the landmarker was a
// process-lifetime singleton and restarting at 0 made the graph reject frames.
//
// Each extraction now builds a COLD landmarker (see resetPoseLandmarker), so the
// instance has no timestamp history and every run can — and must — start at 0. Must,
// because the old scheme was itself a determinism hazard: the same clip was fed a
// different timestamp base on every run, so runs were not comparable even in principle.
// Same file in, same timestamps in, same landmarks out.

export async function extractPoseTrajectory(
  videoBlob: Blob,
  options?: { onProgress?: (fraction: number) => void },
): Promise<PoseSample[]> {
  const onProgress = options?.onProgress;
  // Cold graph for every clip — the tracking state of a previous run must not leak
  // into this one. This is what makes two runs over the same file comparable.
  await resetPoseLandmarker();
  const landmarker = await getPoseLandmarker();

  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });
    await new Promise<void>((resolve) => {
      if (video.readyState >= 3) return resolve();
      video.oncanplaythrough = () => resolve();
      video.load();
    });

    const duration = video.duration;
    if (!duration || duration === Infinity) {
      throw new Error('Cannot determine video duration');
    }

    // Analyse at SAMPLE_FPS regardless of clip length; only the analysed WINDOW is
    // capped. `interval` is derived from the analysed span (not the full duration) so
    // the rate stays put when a clip is truncated.
    const analysisSec = Math.min(duration, MAX_ANALYSIS_SEC);
    const truncated = duration > MAX_ANALYSIS_SEC;
    const count = Math.max(2, Math.round(analysisSec * SAMPLE_FPS));
    const interval = analysisSec / count;

    const samples: PoseSample[] = [];
    let detected = 0;
    let totalInferMs = 0;
    // Per-run timeline, local to this extraction (see the note above).
    let lastTsMs = -1;

    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 0.001, i * interval);
      await seekTo(video, t);
      // Real frame time in ms; force strictly increasing in case two samples round
      // to the same millisecond.
      let tsMs = Math.round(t * 1000);
      if (tsMs <= lastTsMs) tsMs = lastTsMs + 1;
      lastTsMs = tsMs;

      const inferStart = performance.now();
      const result = landmarker.detectForVideo(video, tsMs);
      totalInferMs += performance.now() - inferStart;

      const landmarks = result.landmarks?.[0] ?? [];
      if (landmarks.length > 0) detected++;
      samples.push({ t, landmarks });
      onProgress?.((i + 1) / count);
    }

    // WARN, not INFO: this is the line that proves determinism. `seriesHash` folds the
    // whole wrist series into one number, so two runs over the same file are compared
    // by reading two log lines instead of diffing 953 landmark sets. Equal hash = equal
    // input to every downstream stage. INFO is dropped in production builds AND
    // filtered out of the in-app log panel, which is why the earlier non-determinism
    // went unnoticed for as long as it did.
    log.warn('Pose trajectory extracted', {
      durationSec: Number(duration.toFixed(2)),
      analyzedSec: Number(analysisSec.toFixed(2)),
      truncated,
      sampleFps: Number((1 / interval).toFixed(1)),
      samples: count,
      posesDetected: detected,
      seriesHash: hashWristSeries(samples),
      avgInferMs: Number((totalInferMs / count).toFixed(1)),
      totalMs: Math.round(performance.now() - t0),
    });
    // Truncation drops real footage (and any swing in it), so it must never be
    // silent — WARN surfaces in production builds where INFO is dropped.
    if (truncated) {
      log.warn('Clip truncated for pose analysis', {
        durationSec: Number(duration.toFixed(2)),
        analyzedSec: Number(analysisSec.toFixed(2)),
        droppedSec: Number((duration - analysisSec).toFixed(2)),
        maxAnalysisSec: MAX_ANALYSIS_SEC,
      });
    }

    return samples;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fold the wrist series (landmarks 15/16 — the only ones the envelope reads) into one
 * hex string, so two extractions can be compared from the log. FNV-1a over the
 * coordinates rounded to 5 dp, the same precision the exported fixtures carry: below
 * detection sensitivity, above float noise. Diagnostic only — never a cache key.
 */
function hashWristSeries(samples: PoseSample[]): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const s of samples) {
    for (const idx of [15, 16]) {
      const l = s.landmarks[idx];
      if (!l) {
        mix(0);
        continue;
      }
      mix(Math.round(l.x * 1e5));
      mix(Math.round(l.y * 1e5));
      mix(Math.round((l.visibility ?? 1) * 1e5));
    }
  }
  return h.toString(16).padStart(8, '0');
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
