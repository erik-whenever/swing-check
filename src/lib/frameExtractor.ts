import { createLogger } from './logger';
import { detectSwingEnvelope } from './poseEnvelope';
import { selectEnvelopeFrames } from './poseEnvelopeSelection';

const log = createLogger('FrameExtractor');

/** The swing phases each extracted frame is anchored to. */
export type SwingPhase =
  | 'address'
  | 'backswing'
  | 'top'
  | 'downswing'
  | 'impact'
  | 'follow-through';

export interface FrameMeta {
  b64: string;
  score: number;
  isAddress: boolean;
  isSwingStart: boolean;
  candidateIndex: number;
  /** Swing phase this frame was anchored to during extraction. */
  phase?: SwingPhase;
  /** Timestamp (seconds) the frame was grabbed at. */
  timeSec?: number;
}

export interface ExtractionResult {
  selected: string[];
  meta: FrameMeta[];
}

/** A frame to grab: a timestamp plus the swing phase it is anchored to. */
interface AnchorTime {
  time: number;
  phase: SwingPhase;
}

/** The chosen anchors plus a path-specific diagnostic bag for the summary log. */
interface Selection {
  anchors: AnchorTime[];
  diag: Record<string, unknown>;
}

interface MotionCurve {
  times: number[];
  scores: number[];
  interval: number;
}

/**
 * ANALYSIS FRAME COUNT — the single source of truth for how many frames are
 * extracted per swing and sent to Claude Vision. Both selectors (pose envelope +
 * motion fallback) size their output to this, and the dev preview renders exactly
 * these frames. Raised 10 → 20 (2026-08-06): quality was verified at checkpoint 2
 * with 20 frames; at 10 the sampling is too sparse within the same envelope to
 * cover every swing phase (setup → follow-through needs several frames per phase).
 * Deliberate cost trade-off — ~2× Vision input per swing is accepted. This is the
 * ONLY place the number lives; callers import it rather than hardcoding a count.
 */
export const ANALYSIS_FRAME_COUNT = 20;

// ── Tunables (motion fallback) ───────────────────────────────────────────────
// The pose/envelope path (poseEnvelope.ts) is the PRIMARY selector; the pixel-diff
// motion path below runs only as a fallback when pose is unavailable or the
// envelope read is invalid. These tunables apply to that fallback.
// Coarse pass scans the whole clip to find the address stillness and the swing
// motion that follows it.
const COARSE_FPS = 12;
const COARSE_MAX_SAMPLES = 240;
// The swing is bracketed around the address→motion transition (the impact
// region): this much BEFORE it (late address + backswing + downswing) and this
// much AFTER it (impact + follow-through).
const SWING_PRE_SEC = 1.2;
const SWING_POST_SEC = 1.2;
// Shortest stillness (seconds) that counts as a genuine address hold.
const MIN_STILL_SEC = 0.4;
// Skip the very start of the clip: phone cameras spend the first fraction of a
// second settling auto-exposure / white-balance, which otherwise reads as a big
// false "motion" spike while the golfer is still standing at address.
const SETTLE_SKIP_SEC = 0.5;
// Per-pixel luma change (0–255) above which a pixel counts as having "moved".
const MOTION_PIXEL_THRESHOLD = 24;
// Longest side (px) of the down-scaled canvas used for motion analysis. Small
// enough to suppress sensor/codec noise, large enough to keep the swing visible.
const MOTION_MAX_DIM = 360;

export async function extractFrames(
  videoBlob: Blob,
  count = ANALYSIS_FRAME_COUNT,
  quality = 0.8,
  options?: { onProgress?: (fraction: number) => void },
): Promise<ExtractionResult> {
  const onProgress = options?.onProgress;
  // Progress budget: selection (pose or motion) 0→0.7, frame extraction 0.7→1.0.
  const reportSelect = (fraction: number) => onProgress?.(fraction * 0.7);
  const reportExtract = (i: number, total: number) =>
    onProgress?.(0.7 + (i / total) * 0.3);

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

    // Full-resolution canvas — used only for the final frames sent to Claude.
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth, 1280);
    canvas.height = Math.round(
      (canvas.width / video.videoWidth) * video.videoHeight,
    );
    const ctx = canvas.getContext('2d')!;

    log.info('Video loaded', {
      durationSec: Number(duration.toFixed(2)),
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      requestedFrames: count,
    });

    // ── Selection: pose/envelope PRIMARY, pixel-diff motion FALLBACK ───────────
    // The pose envelope is the production selector (D-3 cutover). When pose can't
    // run (no model, error) or the envelope read is invalid, we silently fall back
    // to the pixel-diff motion path — same output shape, different signal. Which
    // path ran is logged (WARN, below) so field fallback frequency is measurable.
    let path: 'pose' | 'motion';
    let selection = await selectViaPose(videoBlob, count, reportSelect);
    if (selection) {
      path = 'pose';
    } else {
      selection = await selectViaMotion(video, duration, count, reportSelect);
      path = 'motion';
    }
    const { anchors } = selection;

    // ── Grab the selected frames (shared by both paths) ────────────────────────
    const selectedFrames: {
      b64: string;
      time: number;
      data: ImageData;
      phase: SwingPhase;
    }[] = [];

    for (let i = 0; i < anchors.length; i++) {
      const t = Math.min(duration - 0.05, Math.max(0, anchors[i].time));
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      selectedFrames.push({ b64, time: t, data, phase: anchors[i].phase });
      reportExtract(i + 1, anchors.length);
    }

    // Frame-to-frame delta for the selected frames (for the dev preview bars).
    const selectedScores: number[] = [0];
    for (let i = 1; i < selectedFrames.length; i++) {
      selectedScores.push(
        pixelDiff(
          selectedFrames[i - 1].data,
          selectedFrames[i].data,
          canvas.width,
        ),
      );
    }

    const selected = selectedFrames.map((f) => f.b64);
    const meta: FrameMeta[] = selectedFrames.map((f, i) => ({
      b64: f.b64,
      score: Math.round(selectedScores[i] * 100) / 100,
      isAddress: f.phase === 'address',
      isSwingStart: i === 0,
      candidateIndex: i,
      phase: f.phase,
      timeSec: Number(f.time.toFixed(2)),
    }));

    log.info('Frames selected', {
      count: selected.length,
      phases: meta.map((m) => m.phase),
      timesSec: selectedFrames.map((f) => Number(f.time.toFixed(2))),
      scores: meta.map((m) => m.score),
    });

    // Consolidated diagnostic — logged at WARN so it surfaces even in a
    // production/preview build where INFO is dropped. `path` reports which selector
    // actually ran (pose vs the motion fallback) so field fallback frequency is
    // measurable; the fallback is silent to the user but never silent in the logs.
    log.warn('Frame selection', {
      path,
      durationSec: Number(duration.toFixed(2)),
      frameCount: selected.length,
      frameTimesSec: selectedFrames.map((f) => Number(f.time.toFixed(2))),
      ...selection.diag,
    });

    return { selected, meta };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PRIMARY selector. Run pose over the clip, derive the swing envelope, and pick
 * frames uniformly across it (plus a confident-only impact cluster). Returns null
 * — a signal for the caller to fall back to motion — when pose can't run (dynamic
 * import / inference error) or the envelope read is invalid. The heavy
 * @mediapipe/tasks-vision dependency stays out of the main bundle via dynamic
 * import; poseEnvelope / poseEnvelopeSelection are pure and imported statically.
 */
async function selectViaPose(
  videoBlob: Blob,
  count: number,
  reportProgress: (fraction: number) => void,
): Promise<Selection | null> {
  try {
    const { extractPoseTrajectory } = await import('./poseTrajectory');
    const samples = await extractPoseTrajectory(videoBlob, {
      onProgress: reportProgress,
    });
    if (!samples || samples.length === 0) {
      log.warn('Pose unavailable — falling back to motion', {
        reason: 'no pose samples',
      });
      return null;
    }

    const envelope = detectSwingEnvelope(samples);
    if (!envelope.valid) {
      // Ambiguous swing (low visibility, no address plateau, no motion, …). The
      // even-over-span fallback inside selectEnvelopeFrames is worse than the
      // motion path here, so hand back to motion instead of using it.
      log.warn('Envelope invalid — falling back to motion', {
        reason: envelope.reason,
      });
      return null;
    }

    const spanStart = samples[0].t;
    const spanEnd = samples[samples.length - 1].t;
    const sel = selectEnvelopeFrames(envelope, count, spanStart, spanEnd);
    const anchors: AnchorTime[] = sel.picks.map((p) => ({
      time: p.t,
      phase: p.phase,
    }));

    return {
      anchors,
      diag: {
        envelopeSec: [
          Number(envelope.startSec.toFixed(2)),
          Number(envelope.finishSec.toFixed(2)),
        ],
        impactSec: envelope.impact
          ? Number(envelope.impact.timeSec.toFixed(2))
          : null,
        impactReason: envelope.impactReason,
        impactClusterApplied: sel.impactClusterApplied,
        clippedTail: envelope.clippedTail,
        trackedWrist: envelope.trackedWrist,
        visibleFrac: Number(envelope.visibleFrac.toFixed(2)),
        allocation: sel.allocation,
      },
    };
  } catch (err) {
    log.warn('Pose selection failed — falling back to motion', {
      error: String(err),
    });
    return null;
  }
}

/**
 * FALLBACK selector — the original pixel-diff motion path. A pixel-diff metric
 * cannot see the ball strike (a thin, fast club moves few pixels → impact sits in
 * a motion VALLEY while the follow-through body rotation dominates), so we anchor
 * on the long address stillness and the motion that erupts right after it, and
 * bracket the swing around that transition. See ADR-0001.
 */
async function selectViaMotion(
  video: HTMLVideoElement,
  duration: number,
  count: number,
  reportProgress: (fraction: number) => void,
): Promise<Selection> {
  // Heavily down-scaled canvas for motion analysis. Down-scaling averages out
  // per-pixel sensor / codec noise (which at full 1080p makes ~12% of pixels
  // "change" every frame even when the golfer is dead still) while preserving the
  // large, coherent motion of the arms and club. This is what gives the swing a
  // clear motion peak instead of drowning it in the noise floor.
  const motionScale = Math.min(
    1,
    MOTION_MAX_DIM / Math.max(video.videoWidth, video.videoHeight),
  );
  const motionCanvas = document.createElement('canvas');
  motionCanvas.width = Math.max(2, Math.round(video.videoWidth * motionScale));
  motionCanvas.height = Math.max(2, Math.round(video.videoHeight * motionScale));
  const motionCtx = motionCanvas.getContext('2d', {
    willReadFrequently: true,
  })!;

  // ── Phase A: Coarse motion curve across the WHOLE video ────────────────────
  // Scanning the full duration (no fixed end-trim) lets the address/impact read
  // reject walk-up / walk-away motion on its own, regardless of clip length.
  const coarseStart = Math.min(SETTLE_SKIP_SEC, duration * 0.1);
  const coarse = await scanMotion(
    video,
    motionCtx,
    motionCanvas,
    coarseStart,
    duration,
    COARSE_FPS,
    COARSE_MAX_SAMPLES,
    (i, total) => reportProgress(i / total),
  );
  const coarseSmooth = smoothCurve(coarse.scores, 2);

  // Top motion peaks — invaluable for diagnosing where detection landed.
  const topPeaks = coarse.scores
    .map((s, i) => ({ t: Number(coarse.times[i].toFixed(2)), s: Number(s.toFixed(2)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);

  log.info('Coarse scan complete', {
    samples: coarse.scores.length,
    coarseFps: Number((1 / coarse.interval).toFixed(1)),
    startSec: Number(coarseStart.toFixed(2)),
    peakScore: Number(Math.max(...coarse.scores).toFixed(2)),
    topPeaks,
  });

  // ── Phase B: Find the ADDRESS (longest stillness), anchor the swing to it ──
  const stillBaseline = percentile(coarseSmooth, 0.25);
  const peakMotion = Math.max(...coarseSmooth);
  // A frame is "moving" once it clearly exceeds the still baseline but well below
  // the swing's peak, so the address hold reads as still and the swing as moving.
  const moveThreshold = Math.max(stillBaseline * 1.8, peakMotion * 0.15, 0.5);
  const minStillFrames = Math.max(2, Math.round(MIN_STILL_SEC / coarse.interval));

  // Longest run of consecutive "still" frames = the address hold.
  let bestRunLen = 0;
  let bestRunEnd = -1;
  let curRun = 0;
  for (let i = 0; i < coarseSmooth.length; i++) {
    if (coarseSmooth[i] < moveThreshold) {
      curRun++;
      if (curRun > bestRunLen) {
        bestRunLen = curRun;
        bestRunEnd = i;
      }
    } else {
      curRun = 0;
    }
  }

  const foundAddress = bestRunEnd >= 0 && bestRunLen >= minStillFrames;
  let impactTime: number;
  const usedFallback = !foundAddress;
  if (foundAddress) {
    // Impact ≈ where motion erupts after the address. Walk forward from the end
    // of the still run to the first clearly-moving frame.
    let onsetIdx = bestRunEnd;
    for (let i = bestRunEnd + 1; i < coarseSmooth.length; i++) {
      onsetIdx = i;
      if (coarseSmooth[i] >= moveThreshold) break;
    }
    impactTime = coarse.times[onsetIdx];
  } else {
    // No clear address (golfer never holds still) → fall back to the motion peak.
    let peakIdx = 0;
    let peakVal = -1;
    for (let i = 0; i < coarseSmooth.length; i++) {
      if (coarseSmooth[i] > peakVal) {
        peakVal = coarseSmooth[i];
        peakIdx = i;
      }
    }
    impactTime = coarse.times[peakIdx];
    log.warn('Address not found — using motion-peak fallback', {
      moveThreshold: Number(moveThreshold.toFixed(2)),
      stillBaseline: Number(stillBaseline.toFixed(2)),
    });
  }

  // Bracket the swing around the impact transition. The pre-impact lead captures
  // the (often low-motion) backswing/downswing; the post window the follow-
  // through. The window is trimmed if motion re-settles afterwards, so we don't
  // waste frames on the golfer lowering the club / walking off.
  const addressTime = Math.max(0, impactTime - SWING_PRE_SEC);
  let endTime = Math.min(duration - 0.05, impactTime + SWING_POST_SEC);
  {
    const impactIdx = Math.min(
      coarseSmooth.length - 1,
      Math.round((impactTime - coarse.times[0]) / coarse.interval),
    );
    let quiet = 0;
    for (let i = impactIdx + 1; i < coarseSmooth.length; i++) {
      if (coarseSmooth[i] < moveThreshold) {
        quiet++;
        if (quiet >= minStillFrames) {
          const settleTime = coarse.times[i - minStillFrames + 1];
          if (settleTime > impactTime) endTime = Math.min(endTime, settleTime);
          break;
        }
      } else {
        quiet = 0;
      }
    }
  }
  // Top of backswing sits in the pre-impact lead; downswing is the brief stretch
  // just before impact.
  const topTime = Math.max(addressTime, impactTime - 0.3);

  log.info('Swing phases resolved', {
    addressSec: Number(addressTime.toFixed(2)),
    topSec: Number(topTime.toFixed(2)),
    impactSec: Number(impactTime.toFixed(2)),
    endSec: Number(endTime.toFixed(2)),
    windowSec: Number((endTime - addressTime).toFixed(2)),
    moveThreshold: Number(moveThreshold.toFixed(2)),
    stillBaseline: Number(stillBaseline.toFixed(2)),
    addressRunSec: Number((bestRunLen * coarse.interval).toFixed(2)),
    usedFallback,
  });

  // Compact whole-clip motion profile ([timeSec, score] every ~0.25s) so the full
  // shape — not just the top peaks — can be inspected from the logs.
  const curveDigest: [number, number][] = [];
  const digestStride = Math.max(1, Math.round(0.25 / coarse.interval));
  for (let i = 0; i < coarse.scores.length; i += digestStride) {
    curveDigest.push([
      Number(coarse.times[i].toFixed(2)),
      Math.round(coarse.scores[i]),
    ]);
  }

  const anchors = buildAnchorTimes(addressTime, topTime, impactTime, endTime, count);

  return {
    anchors,
    diag: {
      usedFallback,
      coarseImpactSec: Number(impactTime.toFixed(2)),
      addressSec: Number(addressTime.toFixed(2)),
      topSec: Number(topTime.toFixed(2)),
      endSec: Number(endTime.toFixed(2)),
      moveThreshold: Number(moveThreshold.toFixed(2)),
      stillBaseline: Number(stillBaseline.toFixed(2)),
      topPeaks,
      curveDigest,
    },
  };
}

/**
 * Sample motion (weighted pixel diff between consecutive frames) across a time
 * range. Memory is bounded: only the previous frame's pixels are retained.
 */
async function scanMotion(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  startTime: number,
  endTime: number,
  fps: number,
  maxSamples: number,
  onProgress?: (i: number, total: number) => void,
): Promise<MotionCurve> {
  const span = Math.max(0, endTime - startTime);
  const count = Math.max(2, Math.min(Math.round(span * fps), maxSamples));
  const interval = span / count;
  const times: number[] = [];
  const scores: number[] = [];
  let prev: ImageData | null = null;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * interval;
    await seekTo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const score = prev ? pixelDiff(prev, data, canvas.width) : 0;
    times.push(time);
    scores.push(score);
    prev = data;
    onProgress?.(i + 1, count);
  }

  return { times, scores, interval };
}

/**
 * Spread `count` frames EVENLY across the swing window and label each by its
 * position relative to the top / impact anchors. Even spacing (rather than
 * clustering on anchors) is deliberate: because the ball strike is nearly
 * invisible to the motion metric, the exact impact time is an estimate, so
 * blanket coverage of the whole window is more reliable than betting frames on a
 * precise impact instant. The frame nearest the estimated impact is forced to
 * the 'impact' label so the sequence always has an anchor.
 */
function buildAnchorTimes(
  tAddr: number,
  tTop: number,
  tImpact: number,
  tEnd: number,
  count: number,
): AnchorTime[] {
  const out: AnchorTime[] = [];
  let nearestImpact = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? tAddr : tAddr + ((tEnd - tAddr) * i) / (count - 1);
    let phase: SwingPhase;
    if (i === 0) phase = 'address';
    else if (t < tTop) phase = 'backswing';
    else if (t < tImpact) phase = 'downswing';
    else phase = 'follow-through';
    out.push({ time: t, phase });

    const dist = Math.abs(t - tImpact);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestImpact = i;
    }
  }
  if (out[nearestImpact]) out[nearestImpact].phase = 'impact';
  return out;
}

/** Small moving-average smoother (window = `half` samples each side). */
function smoothCurve(scores: number[], half: number): number[] {
  const out: number[] = new Array(scores.length);
  for (let i = 0; i < scores.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < scores.length) {
        sum += scores[j];
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

/** Value at the given fraction (0–1) of the sorted values, e.g. 0.25 = lower quartile. */
function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(fraction * (sorted.length - 1))),
  );
  return sorted[idx];
}

/**
 * Motion score = fraction (×100) of centre-weighted pixels whose brightness
 * changed beyond a threshold, AFTER subtracting any uniform global brightness
 * shift between the two frames.
 *
 * A plain average pixel difference is dominated by whole-frame illumination
 * changes — camera auto-exposure / white-balance settling, cloud shadow, screen
 * flicker — which shift every pixel a little and can outweigh the swing itself,
 * producing a false motion peak while the golfer stands still. Compensating for
 * the global shift and then counting only pixels that moved a lot makes the
 * score fire on localised motion (the club, arms, body) and stay near zero for
 * uniform lighting changes. Edge pixels are down-weighted since the golfer is
 * almost always framed near the centre.
 */
function pixelDiff(a: ImageData, b: ImageData, width: number): number {
  const len = a.data.length;
  const step = 64; // sample every 16th pixel
  const lo = width * 0.2;
  const hi = width * 0.8;

  // Pass 1: mean luma of each frame over the sampled pixels → global shift.
  let sumA = 0;
  let sumB = 0;
  let n = 0;
  for (let i = 0; i < len; i += step) {
    sumA += 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
    sumB += 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2];
    n++;
  }
  if (n === 0) return 0;
  const globalShift = (sumB - sumA) / n;

  // Pass 2: count centre-weighted pixels that moved beyond the threshold.
  let changed = 0;
  let weightTotal = 0;
  for (let i = 0; i < len; i += step) {
    const lumaA = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2];
    const lumaB = 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2];
    const diff = Math.abs(lumaB - lumaA - globalShift);
    const x = (i >> 2) % width;
    const w = x >= lo && x <= hi ? 1 : 0.35;
    weightTotal += w;
    if (diff > MOTION_PIXEL_THRESHOLD) changed += w;
  }

  return weightTotal > 0 ? (changed / weightTotal) * 100 : 0;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}
