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
const MAX_SAMPLES = 240;

export interface PoseSample {
  /** Timestamp in seconds (relative to the start of the clip). */
  t: number;
  /** All 33 MediaPipe pose landmarks, or [] if no pose was detected. */
  landmarks: NormalizedLandmark[];
}

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

    const count = Math.max(2, Math.min(Math.round(duration * SAMPLE_FPS), MAX_SAMPLES));
    const interval = duration / count;

    const samples: PoseSample[] = [];
    let detected = 0;
    let totalInferMs = 0;
    // detectForVideo requires strictly increasing timestamps; we always seek
    // forward, but guard against zero-width intervals collapsing two samples
    // onto the same integer millisecond.
    let lastTsMs = -1;

    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      const t = Math.min(duration - 0.001, i * interval);
      await seekTo(video, t);
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

    log.info('Pose trajectory extracted', {
      durationSec: Number(duration.toFixed(2)),
      sampleFps: Number((1 / interval).toFixed(1)),
      samples: count,
      posesDetected: detected,
      avgInferMs: Number((totalInferMs / count).toFixed(1)),
      totalMs: Math.round(performance.now() - t0),
    });

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
