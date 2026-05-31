import { createLogger } from './logger';

const log = createLogger('FrameExtractor');

export interface FrameMeta {
  b64: string;
  score: number;
  isAddress: boolean;
  isSwingStart: boolean;
  candidateIndex: number;
}

export interface ExtractionResult {
  selected: string[];
  meta: FrameMeta[];
}

export async function extractFrames(
  videoBlob: Blob,
  count = 10,
  quality = 0.8,
  options?: { skipEndTrim?: boolean; onProgress?: (fraction: number) => void },
): Promise<ExtractionResult> {
  const onProgress = options?.onProgress;
  // Phase 1 (motion scan) is weighted as 70% of the work, phase 2 (frame grab) 30%.
  const reportPhase1 = (i: number, total: number) =>
    onProgress?.((i / total) * 0.7);
  const reportPhase2 = (i: number, total: number) =>
    onProgress?.(0.7 + (i / total) * 0.3);
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });

  await new Promise<void>((resolve) => {
    if (video.readyState >= 3) return resolve();
    video.oncanplaythrough = () => resolve();
    video.load();
  });

  const duration = video.duration;
  if (!duration || duration === Infinity) {
    throw new Error("Cannot determine video duration");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth, 1280);
  canvas.height = Math.round(
    (canvas.width / video.videoWidth) * video.videoHeight,
  );
  const ctx = canvas.getContext("2d")!;

  // ── Phase 1: Sample motion across the whole video to find the swing window ──
  // Position-first: the address is always BEFORE the first motion in the video, so
  // scanning FORWARD from frame 0 for the first motion never confuses the brief
  // top-of-backswing pause (which happens after motion has already started) with address.
  const SKIP_END = options?.skipEndTrim ? 0 : 3;
  const scanEnd =
    SKIP_END > 0 ? Math.max(duration - SKIP_END, duration * 0.6) : duration;

  // Sample at the video's frame rate (approx). Memory is bounded by computing the
  // motion score on the fly and only keeping the previous frame's pixels.
  const SAMPLE_FPS = 30;
  const MAX_SAMPLES = 300;
  const frameCount = Math.max(
    2,
    Math.min(Math.round(scanEnd * SAMPLE_FPS), MAX_SAMPLES),
  );
  const sampleInterval = scanEnd / frameCount;

  log.info('Video loaded', {
    durationSec: Number(duration.toFixed(2)),
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    sampleFps: SAMPLE_FPS,
    fpsEstimate: Number((1 / sampleInterval).toFixed(1)),
    plannedSamples: frameCount,
    scanEndSec: Number(scanEnd.toFixed(2)),
    skipEndTrim: !!options?.skipEndTrim,
  });

  const times: number[] = [];
  const scores: number[] = [];
  let prev: ImageData | null = null;
  for (let i = 0; i < frameCount; i++) {
    const time = i * sampleInterval;
    await seekTo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const score = prev ? pixelDiff(prev, data) : 0;
    times.push(time);
    scores.push(score);
    prev = data;
    log.debug(`Motion frame #${i}`, {
      index: i,
      timeSec: Number(time.toFixed(3)),
      score: Number(score.toFixed(2)),
    });
    reportPhase1(i + 1, frameCount);
  }

  // Impact = the frame with peak motion across the whole video. This is the single
  // most reliable anchor: the ball strike always dominates every other movement.
  let impactIdx = 0;
  let impactScore = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > impactScore) {
      impactScore = scores[i];
      impactIdx = i;
    }
  }

  log.info('Impact frame detected', {
    impactIdx,
    timeSec: Number(times[impactIdx].toFixed(2)),
    score: Number(impactScore.toFixed(2)),
  });

  // ── Find swing start by scanning BACKWARDS from impact ──
  // The backswing shows moderate-to-high sustained motion leading up to impact.
  // The address position is the first EXTENDED stillness we hit going back: motion
  // below 8% of peak that STAYS there for several consecutive frames. The "sustained"
  // requirement is what distinguishes the address from momentary dips like a grip
  // adjustment or the top-of-backswing transition (which are brief quiet spots flanked
  // by motion, not the long calm of address).
  const quietThreshold = impactScore * 0.08;
  const QUIET_RUN = 5; // consecutive sub-threshold frames that mark true stillness
  const framesPerSecond = 1 / sampleInterval;
  const maxLookbackFrames = Math.round(8 * framesPerSecond);
  const minLookbackIdx = Math.max(0, impactIdx - maxLookbackFrames);

  // Walk back from just before impact. `runTop` remembers the frame closest to impact
  // in the current quiet run; once the run reaches QUIET_RUN, that frame is the address.
  let swingStartIdx = -1;
  let run = 0;
  let runTop = -1;
  for (let i = impactIdx - 1; i >= minLookbackIdx; i--) {
    if (scores[i] < quietThreshold) {
      if (run === 0) runTop = i;
      run++;
      if (run >= QUIET_RUN) {
        swingStartIdx = runTop;
        break;
      }
    } else {
      run = 0;
      runTop = -1;
    }
  }

  // Fallback: no sustained quiet period within 8s before impact → use the frame ~4s back.
  const usedFallback = swingStartIdx === -1;
  if (usedFallback) {
    swingStartIdx = Math.max(0, impactIdx - Math.round(4 * framesPerSecond));
    log.warn('Swing-start fallback triggered', {
      reason: 'no sustained quiet period (QUIET_RUN frames below threshold) within 8s before impact',
      quietThreshold: Number(quietThreshold.toFixed(2)),
      quietRunFrames: QUIET_RUN,
      maxLookbackFrames,
      impactIdx,
      fallbackSwingStartIdx: swingStartIdx,
    });
  }

  log.info('Swing start detected', {
    swingStartIdx,
    timeSec: Number(times[swingStartIdx].toFixed(2)),
    score: Number(scores[swingStartIdx].toFixed(2)),
    quietThreshold: Number(quietThreshold.toFixed(2)),
    usedFallback,
  });

  const swingStartTime = times[swingStartIdx];
  const swingEndTime = times[impactIdx];
  // Extend the window to impact + 2 frames so the strike itself is captured, not clipped.
  const extractEndTime = Math.min(
    duration - 0.05,
    swingEndTime + 2 * sampleInterval,
  );

  log.info('Swing window resolved', {
    windowSec: Number((extractEndTime - swingStartTime).toFixed(2)),
    swingStartSec: Number(swingStartTime.toFixed(2)),
    extractEndSec: Number(extractEndTime.toFixed(2)),
    requestedFrames: count,
  });

  // ── Phase 2: Extract exactly `count` frames at evenly spaced timestamps from swing start to impact+2 ──
  const swingDuration = extractEndTime - swingStartTime;
  const selectedFrames: { b64: string; time: number; data: ImageData }[] = [];

  for (let i = 0; i < count; i++) {
    const t =
      count === 1
        ? swingStartTime
        : swingStartTime + (i * swingDuration) / (count - 1);
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    selectedFrames.push({ b64, time: t, data });
    reportPhase2(i + 1, count);
  }

  URL.revokeObjectURL(url);

  // Compute motion scores for selected frames
  const selectedScores: number[] = [0];
  for (let i = 1; i < selectedFrames.length; i++) {
    selectedScores.push(
      pixelDiff(selectedFrames[i - 1].data, selectedFrames[i].data),
    );
  }

  const selected = selectedFrames.map((f) => f.b64);

  const meta: FrameMeta[] = selectedFrames.map((f, i) => ({
    b64: f.b64,
    score: Math.round(selectedScores[i] * 100) / 100,
    isAddress: i === 0,
    isSwingStart: i === 0,
    candidateIndex: i,
  }));

  log.info('Frames selected', {
    count: selected.length,
    indices: meta.map((m) => m.candidateIndex),
    timesSec: selectedFrames.map((f) => Number(f.time.toFixed(2))),
    scores: meta.map((m) => m.score),
  });

  return { selected, meta };
}

/** Average absolute pixel difference between two ImageData (sampled for speed). */
function pixelDiff(a: ImageData, b: ImageData): number {
  const len = a.data.length;
  const step = 64;
  let sum = 0;
  let samples = 0;

  for (let i = 0; i < len; i += step) {
    sum += Math.abs(a.data[i] - b.data[i]);
    sum += Math.abs(a.data[i + 1] - b.data[i + 1]);
    sum += Math.abs(a.data[i + 2] - b.data[i + 2]);
    samples++;
  }

  return sum / (samples * 3);
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
