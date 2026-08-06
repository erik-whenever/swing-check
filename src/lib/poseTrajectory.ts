// Run PoseLandmarker across a swing video and return a time series of body
// landmarks. This mirrors frameExtractor.ts's seek-and-grab pattern (a hidden
// <video> we seek frame-by-frame) but feeds each frame to MediaPipe instead of
// diffing pixels. No phase detection here — just the raw trajectory that later
// passes will analyse.

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { getPoseLandmarker } from './poseDetector';
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

// detectForVideo in VIDEO mode demands strictly increasing timestamps for the
// WHOLE lifetime of the (singleton) PoseLandmarker — not just within one clip.
// Resetting to 0 for each new video makes the graph reject frames ("current
// minimum expected timestamp is N but received 0"). So we track the last
// timestamp handed to the landmarker at module scope (same lifetime as the
// singleton) and shift each new clip's timeline to start after it. Within a
// clip the real frame spacing (~66 ms) is preserved so any temporal tracking
// stays sane; the absolute offset between clips is irrelevant to detection.
let lastGlobalTsMs = -1;

export async function extractPoseTrajectory(
  videoBlob: Blob,
  options?: { onProgress?: (fraction: number) => void },
): Promise<PoseSample[]> {
  const onProgress = options?.onProgress;
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
    // Shift this clip so its first frame lands just after everything the
    // landmarker has already seen (see lastGlobalTsMs above). +1 ms gap.
    const clipBaseMs = lastGlobalTsMs + 1;

    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 0.001, i * interval);
      await seekTo(video, t);
      // Real frame time offset onto the global timeline; force strictly
      // increasing in case two samples round to the same millisecond.
      let tsMs = clipBaseMs + Math.round(t * 1000);
      if (tsMs <= lastGlobalTsMs) tsMs = lastGlobalTsMs + 1;
      lastGlobalTsMs = tsMs;

      const inferStart = performance.now();
      const result = landmarker.detectForVideo(video, tsMs);
      totalInferMs += performance.now() - inferStart;

      const landmarks = result.landmarks?.[0] ?? [];
      if (landmarks.length > 0) detected++;
      samples.push({ t, landmarks });
      onProgress?.((i + 1) / count);
    }

    log.info('Pose trajectory extracted', {
      durationSec: Number(duration.toFixed(2)),
      analyzedSec: Number(analysisSec.toFixed(2)),
      truncated,
      sampleFps: Number((1 / interval).toFixed(1)),
      samples: count,
      posesDetected: detected,
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

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
