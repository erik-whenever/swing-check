// LIVE POSE LOOP (ADR-003 §4, D-5 pass 2) — pose on the camera preview, in a rAF
// loop, while recording. No seeking, no post-processing of the finished clip.
//
// WHY THIS EXISTS. The clip path (`poseTrajectory.extractPoseTrajectory`) seeks a
// hidden <video> once per sample and waits for `onseeked`. Seeking is the expensive
// part — it dominates the ~2–5 min a long clip costs — and it can only run AFTER the
// recording stops. Both properties are fatal for the session vision: feedback has to
// arrive between swings, not after the range session. Reading the live <video>
// element instead removes the seek entirely; the frame is already decoded and on
// screen, so the only cost left is the inference itself.
//
// THIS FILE ONLY PRODUCES SAMPLES. Swing detection is `liveSwingDetector.ts`, which
// consumes the ring buffer. The split is deliberate: everything here is timing and
// browser state (untestable without a camera), everything there is pure.
//
// TWO-STAGE CADENCE (ADR-003 §4 last bullet + Risker §1). Running 15 fps inference
// for 30 minutes is the single biggest risk in ADR-003 — a hot phone throttles its
// camera and the whole thing degrades in a way that is hard to see from the outside.
// So the loop idles at GUARD_FPS and only escalates to ACTIVE_FPS on motion.
//
// The escalation is deliberately biased toward ACTIVE. The asymmetry is not close:
// sampling too slowly loses a swing outright (the envelope's structural constants are
// frame-counted, see the OSÄKER note on ACTIVE_DWELL_SEC), while sampling too fast
// costs battery. So the speed threshold is low and the dwell is long — the loop stays
// fast for seconds after the last movement rather than dropping the moment a golfer
// settles into address.

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { createLogger, serializeError } from './logger';
import type { PoseRingBuffer } from './poseRingBuffer';
import type { PoseSample } from './poseTrajectory';

const log = createLogger('LivePose');

// ── Tunables ─────────────────────────────────────────────────────────────────
/** Idle watch rate. Low enough to be cheap, dense enough to notice a golfer moving. */
export const GUARD_FPS = 5;
/**
 * Working rate — the same 15 fps the clip path samples at, and the rate every
 * threshold in poseEnvelope.ts / poseSegments.ts was measured against.
 */
export const ACTIVE_FPS = 15;
/**
 * ESCALATION THRESHOLD (normalized units/s, hand midpoint). Deliberately LOW: measured
 * dead-address wrist speed sits under ~0.05 (poseEnvelope's START_QUIET_FLOOR is 0.04),
 * a take-away ramps past 0.3, so 0.10 sits in the gap while erring toward escalating.
 * OSÄKER: guessed from the clip-path fixtures, not from live camera noise, which may be
 * jumpier (handheld tripod, wind). If the loop never drops to guard in Erik's field
 * test, the guard-speed percentiles logged below are the data to raise it with.
 */
const MOTION_ESCALATE_SPEED = 0.1;
/**
 * How long ACTIVE is held after the last motion.
 * OSÄKER — this is the constant that protects detection quality, not battery. The
 * envelope's structural constants are FRAME counts, not durations (FINISH_MIN_HOLD_FRAMES
 * = 3, SMOOTH_HALF = 1), so a window that mixes 5 fps and 15 fps samples changes what
 * "3 frames" means in time. The mitigation is exactly this dwell: a golfer walks in,
 * sets up and waggles (motion → ACTIVE), then holds address for typically 1–3 s. With a
 * 4 s dwell the entire address + swing + settle is captured at ACTIVE_FPS and the guard
 * samples in the window are the quiet stretch BEFORE it, which segmentation reads as a
 * stillness island either way. A golfer who freezes at address for longer than the dwell
 * would take the first frames of the take-away at guard rate — measure this in the field
 * before trusting it.
 */
const ACTIVE_DWELL_SEC = 4.0;
/** Rolling window of inference times used for the percentile stats. */
const INFER_WINDOW = 120;
/** How often the loop dumps its measurements (seconds). Thermal signal lives here. */
const STATS_LOG_INTERVAL_SEC = 5;
/** Wrist landmark indices (mirrors poseEnvelope.ts / poseSegments.ts). */
const WRIST_LEFT = 15;
const WRIST_RIGHT = 16;

export type Cadence = 'guard' | 'active';

export interface LiveLoopStats {
  cadence: Cadence;
  targetFps: number;
  /** Sampling rate actually achieved over the last stats window. */
  achievedFps: number;
  elapsedSec: number;
  /** Inferences run this session. */
  samples: number;
  posesDetected: number;
  /** Inferences that threw (MediaPipe error) — should stay 0. */
  errors: number;
  lastInferMs: number;
  avgInferMs: number;
  p95InferMs: number;
  maxInferMs: number;
  /**
   * True when inference alone costs more than one frame interval at the target rate,
   * i.e. the requested cadence is unreachable no matter how the loop is scheduled.
   * This is the honest thermal/throttling signal — a device that starts fine and turns
   * saturated mid-session is throttling.
   */
  saturated: boolean;
  bufferSize: number;
  bufferSpanSec: number;
  /** Samples the ring buffer has overwritten — proof the bound is doing work. */
  bufferEvicted: number;
  delegate: 'GPU' | 'CPU' | null;
  /** Smoothed hand speed of the most recent sample — what drives escalation. */
  lastSpeed: number;
}

export interface LivePoseLoopOptions {
  video: HTMLVideoElement;
  landmarker: PoseLandmarker;
  buffer: PoseRingBuffer;
  delegate?: 'GPU' | 'CPU' | null;
  /**
   * `performance.now()` value that sample times are measured from. Defaults to the
   * moment `start()` is called.
   *
   * D-5 pass 3 passes the RECORDING start here, and that alignment is load-bearing:
   * a swing detected at t=34.2 has to name the same instant in the video chunk ring
   * as it does in the landmark ring, or the frames grabbed for it come from the
   * wrong part of the session. The two clocks used to differ by however long
   * `createPoseLandmarker()` took (seconds, on a cold GPU probe).
   */
  epochMs?: number;
  /** Called after every sample is pushed. Keep it cheap — it runs on the rAF thread. */
  onSample?: (sample: PoseSample, stats: LiveLoopStats) => void;
  /** Called at STATS_LOG_INTERVAL_SEC, right after the stats line is logged. */
  onStats?: (stats: LiveLoopStats) => void;
}

interface Vec {
  x: number;
  y: number;
}

export class LivePoseLoop {
  private readonly video: HTMLVideoElement;
  private readonly landmarker: PoseLandmarker;
  private readonly buffer: PoseRingBuffer;
  private readonly delegate: 'GPU' | 'CPU' | null;
  private readonly onSample?: LivePoseLoopOptions['onSample'];
  private readonly onStats?: LivePoseLoopOptions['onStats'];
  private readonly epochMs?: number;

  private raf: number | null = null;
  private running = false;
  private startedAt = 0;
  private lastSampleAt = 0;
  /** MediaPipe requires strictly increasing timestamps for this instance's lifetime. */
  private lastTsMs = -1;

  private cadence: Cadence = 'active';
  private lastMotionAt = 0;
  private prevPos: Vec | null = null;
  /** Clock of the sample `prevPos` came from — the cadence signal's own dt. */
  private prevPosAt = 0;
  private lastSpeed = 0;

  private samples = 0;
  private posesDetected = 0;
  private errors = 0;
  private lastInferMs = 0;
  private inferTimes: number[] = [];
  private totalInferMs = 0;

  private statsWindowStart = 0;
  private statsWindowSamples = 0;

  constructor(options: LivePoseLoopOptions) {
    this.video = options.video;
    this.landmarker = options.landmarker;
    this.buffer = options.buffer;
    this.delegate = options.delegate ?? null;
    this.onSample = options.onSample;
    this.onStats = options.onStats;
    this.epochMs = options.epochMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    // Sample times are measured from the shared epoch when one was given (the
    // recording start), so landmark times and video-chunk times name the same
    // instants. Falls back to loop start, which is pass 2's behaviour.
    this.startedAt = this.epochMs ?? now;
    this.lastSampleAt = 0;
    this.statsWindowStart = now;
    // Start ACTIVE: the interesting moment is often immediately after the record
    // button, and escalating late costs a swing while starting fast costs nothing.
    this.cadence = 'active';
    this.lastMotionAt = now;
    log.warn('Live pose loop started', {
      guardFps: GUARD_FPS,
      activeFps: ACTIVE_FPS,
      dwellSec: ACTIVE_DWELL_SEC,
      escalateSpeed: MOTION_ESCALATE_SPEED,
      ringCapacity: this.buffer.capacity,
      delegate: this.delegate,
      // How far behind the shared epoch the loop actually started — i.e. how long
      // landmarker construction took. Non-zero is normal; it is the reason the
      // epoch is passed in rather than taken here.
      clockOffsetSec: round1((now - this.startedAt) / 1000),
    });
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    const s = this.stats();
    // Final line is the session summary — the one Erik reads for the thermal verdict.
    log.warn('Live pose loop stopped', {
      elapsedSec: s.elapsedSec,
      samples: s.samples,
      posesDetected: s.posesDetected,
      errors: s.errors,
      avgInferMs: s.avgInferMs,
      p95InferMs: s.p95InferMs,
      maxInferMs: s.maxInferMs,
      saturated: s.saturated,
      bufferSize: s.bufferSize,
      bufferEvicted: s.bufferEvicted,
      delegate: s.delegate,
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get targetFps(): number {
    return this.cadence === 'active' ? ACTIVE_FPS : GUARD_FPS;
  }

  stats(): LiveLoopStats {
    const now = performance.now();
    const windowSec = (now - this.statsWindowStart) / 1000;
    const sorted = [...this.inferTimes].sort((a, b) => a - b);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]
      : 0;
    const avg = this.samples > 0 ? this.totalInferMs / this.samples : 0;
    return {
      cadence: this.cadence,
      targetFps: this.targetFps,
      achievedFps: windowSec > 0 ? round1(this.statsWindowSamples / windowSec) : 0,
      elapsedSec: round1((now - this.startedAt) / 1000),
      samples: this.samples,
      posesDetected: this.posesDetected,
      errors: this.errors,
      lastInferMs: round1(this.lastInferMs),
      avgInferMs: round1(avg),
      p95InferMs: round1(p95),
      maxInferMs: round1(sorted.length ? sorted[sorted.length - 1] : 0),
      saturated: avg > 1000 / this.targetFps,
      bufferSize: this.buffer.size,
      bufferSpanSec: round1(this.buffer.spanSec),
      bufferEvicted: this.buffer.evictedCount,
      delegate: this.delegate,
      lastSpeed: round3(this.lastSpeed),
    };
  }

  private tick = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const now = performance.now();
    // Subtract one frame of slack: rAF fires on the display's cadence (~16.7 ms), so a
    // strict `>= interval` test systematically lands one vsync late and turns a 15 fps
    // target into ~12 fps. Sampling a hair early is harmless — the timestamps recorded
    // are the real ones either way.
    const intervalMs = 1000 / this.targetFps - 8;
    if (now - this.lastSampleAt < intervalMs) return;
    if (!this.videoReady()) return;
    this.lastSampleAt = now;

    // Timestamps must strictly increase for this landmarker instance; two rAF frames
    // can round to the same millisecond on a fast display.
    let tsMs = Math.round(now - this.startedAt);
    if (tsMs <= this.lastTsMs) tsMs = this.lastTsMs + 1;
    this.lastTsMs = tsMs;

    let landmarks: NormalizedLandmark[];
    const t0 = performance.now();
    try {
      const result = this.landmarker.detectForVideo(this.video, tsMs);
      landmarks = result.landmarks?.[0] ?? [];
    } catch (err) {
      this.errors++;
      // Never kill the loop on a single bad frame: a dropped frame costs one sample,
      // a dead loop costs the whole session.
      log.warn('Live inference failed', { error: serializeError(err), tsMs });
      return;
    }
    const inferMs = performance.now() - t0;

    this.samples++;
    this.statsWindowSamples++;
    this.lastInferMs = inferMs;
    this.totalInferMs += inferMs;
    this.inferTimes.push(inferMs);
    if (this.inferTimes.length > INFER_WINDOW) this.inferTimes.shift();
    if (landmarks.length > 0) this.posesDetected++;

    const sample: PoseSample = { t: (now - this.startedAt) / 1000, landmarks };
    this.buffer.push(sample);
    this.updateCadence(sample, now);

    const stats = this.stats();
    this.onSample?.(sample, stats);
    this.maybeLogStats(now, stats);
  };

  /** A live <video> has no frame to read before it has decoded one. */
  private videoReady(): boolean {
    return (
      this.video.readyState >= 2 &&
      this.video.videoWidth > 0 &&
      this.video.videoHeight > 0 &&
      !this.video.paused
    );
  }

  /**
   * Guard-signal only — NOT the detection signal.
   *
   * This is a third copy of the visibility-weighted hand midpoint that poseEnvelope.ts
   * and poseSegments.ts each carry, and it is deliberately NOT bound to stay in sync
   * with them: it decides the SAMPLING RATE and nothing else. If it drifts, the worst
   * case is that the loop escalates a little early or late, which the long dwell
   * absorbs. Acceptance still rests entirely on the two synced copies. Keeping this one
   * independent is what lets the detection files stay untouched.
   */
  private updateCadence(sample: PoseSample, now: number): void {
    const pos = weightedHands(sample);
    if (pos && this.prevPos) {
      const dt = (now - this.prevPosAt) / 1000;
      if (dt > 0) {
        const speed = Math.hypot(pos.x - this.prevPos.x, pos.y - this.prevPos.y) / dt;
        // One-pole smoothing: a single jittery landmark should not flip the cadence,
        // but a genuine take-away must not be averaged away either.
        this.lastSpeed = this.lastSpeed * 0.5 + speed * 0.5;
      }
    }
    if (pos) {
      this.prevPos = pos;
      this.prevPosAt = now;
    }

    const previous = this.cadence;
    if (this.lastSpeed >= MOTION_ESCALATE_SPEED) {
      this.lastMotionAt = now;
      this.cadence = 'active';
    } else if (now - this.lastMotionAt > ACTIVE_DWELL_SEC * 1000) {
      this.cadence = 'guard';
    }
    if (previous !== this.cadence) {
      // WARN because requirement 6 asks which cadence is active, and the in-app log
      // panel only shows WARN and above.
      log.warn('Cadence changed', {
        from: previous,
        to: this.cadence,
        targetFps: this.targetFps,
        speed: round3(this.lastSpeed),
        elapsedSec: round1((now - this.startedAt) / 1000),
      });
    }
  }

  private maybeLogStats(now: number, stats: LiveLoopStats): void {
    if (now - this.statsWindowStart < STATS_LOG_INTERVAL_SEC * 1000) return;
    // The thermal measurement (ADR-003 Risker §1). Read across a session: a rising
    // avg/p95 with achievedFps falling below targetFps is throttling, and `saturated`
    // says the target is unreachable rather than merely missed.
    log.warn('Live pose stats', {
      cadence: stats.cadence,
      targetFps: stats.targetFps,
      achievedFps: stats.achievedFps,
      avgInferMs: stats.avgInferMs,
      p95InferMs: stats.p95InferMs,
      maxInferMs: stats.maxInferMs,
      lastInferMs: stats.lastInferMs,
      saturated: stats.saturated,
      samples: stats.samples,
      posesDetected: stats.posesDetected,
      errors: stats.errors,
      bufferSize: stats.bufferSize,
      bufferSpanSec: stats.bufferSpanSec,
      bufferEvicted: stats.bufferEvicted,
      elapsedSec: stats.elapsedSec,
      delegate: stats.delegate,
    });
    this.statsWindowStart = now;
    this.statsWindowSamples = 0;
    this.onStats?.(stats);
  }
}

function weightedHands(sample: PoseSample): Vec | null {
  const l = sample.landmarks[WRIST_LEFT];
  const r = sample.landmarks[WRIST_RIGHT];
  const wl = l ? (l.visibility ?? 1) : 0;
  const wr = r ? (r.visibility ?? 1) : 0;
  const sum = wl + wr;
  if (sum <= 0) return null;
  return {
    x: ((l ? l.x * wl : 0) + (r ? r.x * wr : 0)) / sum,
    y: ((l ? l.y * wl : 0) + (r ? r.y * wr : 0)) / sum,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
