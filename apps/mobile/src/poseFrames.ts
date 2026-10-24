// From the pose module's per-frame result to what core reads (pose-android.md §5).
// The per-frame functions run in the frame-processor worklet, so they are worklets.
import type { NormalizedLandmark, PoseSample } from '@swingcheck/core/lib/poseSample';
import { createSynchronizable, type FixedSynchronizable } from 'react-native-worklets';

/** Core is fed at 15 fps until N-4 recalibrates its constants for 30 fps (ADR-0004, S-49 §6). */
export const CORE_FPS = 15;
const CAMERA_FPS = 30;
/**
 * Keep a frame when at least one core interval minus half a camera frame has passed since the
 * last kept one. Time-based, not "every other frame": Android frames arrive with jitter, and a
 * dropped frame must not shift the cadence (same idea as the slack in livePoseLoop.tick).
 */
const KEEP_AFTER_SEC = 1 / CORE_FPS - 0.5 / CAMERA_FPS;

/** 33 × [x, y, z, visibility] Float32 from PoseResult.landmarks → core's landmark objects. */
export function unpackLandmarks(buffer: ArrayBuffer): NormalizedLandmark[] {
  'worklet';
  const f = new Float32Array(buffer);
  const out: NormalizedLandmark[] = [];
  for (let i = 0; i + 3 < f.length; i += 4) {
    out.push({ x: f[i], y: f[i + 1], z: f[i + 2], visibility: f[i + 3] });
  }
  return out;
}

/**
 * Session state shared between the RN thread (reset) and the frame worklet (read/write).
 * Synchronizables, because a plain object captured by a worklet is copied into its runtime.
 */
export interface SessionClock {
  /** Camera time of the session's first frame, s; NaN until the first frame. */
  originSec: FixedSynchronizable<number>;
  /** t of the last frame kept for core, s. */
  lastKeptSec: FixedSynchronizable<number>;
}

export function createSessionClock(): SessionClock {
  return {
    originSec: createSynchronizable(NaN, { fixedType: true }),
    lastKeptSec: createSynchronizable(-1e9, { fixedType: true }),
  };
}

/** A new session: the next frame becomes t = 0. */
export function resetSessionClock(clock: SessionClock): void {
  clock.originSec.setBlocking(NaN);
  clock.lastKeptSec.setBlocking(-1e9);
}

/**
 * t = seconds since the session's first frame, on the frame's own camera timestamp
 * (PoseResult.frameTimeSec = ImageInfo.timestamp ns / 1e9 on Android). That is the same clock,
 * unit and origin as capture.append(frame) will return: (pts − pts₀) / 1e9 on the same native
 * PTS (ADR-0004 tillägget, rututtag.md).
 * N-3.4: replaced by `const t = capture.append(frame)`, called before pose.detect in onFrame.
 */
export function sessionTime(clock: SessionClock, frameTimeSec: number): number {
  'worklet';
  let origin = clock.originSec.getDirty();
  if (Number.isNaN(origin)) {
    origin = frameTimeSec;
    clock.originSec.setDirty(origin);
  }
  return frameTimeSec - origin;
}

/** True when this frame goes to core (15 fps, time-based). */
export function keepForCore(clock: SessionClock, t: number): boolean {
  'worklet';
  if (t - clock.lastKeptSec.getDirty() < KEEP_AFTER_SEC) return false;
  clock.lastKeptSec.setDirty(t);
  return true;
}

/** The web's `result.landmarks?.[0] ?? []`: no pose → empty landmarks. */
export function toPoseSample(t: number, ok: boolean, buffer: ArrayBuffer): PoseSample {
  'worklet';
  return { t, landmarks: ok ? unpackLandmarks(buffer) : [] };
}
