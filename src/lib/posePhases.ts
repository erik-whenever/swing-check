// STEG 1 (Ström D, Pass 2) — Wrist-trajectory swing-phase detection.
//
// Given the pose trajectory that FramePreview already computed (do NOT re-run
// pose), derive swing-phase boundaries from the WRISTS (MediaPipe landmarks 15 =
// left, 16 = right). This is a SELECTION signal only — no club, no swing-plane
// math, no rule evaluation. Everything here is pure and testable; it takes the
// PoseSample[] time series and returns four timestamps + a confidence flag.
//
// Coordinate note: MediaPipe normalized coords have origin top-left with y
// growing DOWNWARD, so "wrists up" = smaller y and the vertical apex (top of
// backswing) is the MINIMUM y.

import type { PoseSample } from './poseTrajectory';

// ── Tunables ─────────────────────────────────────────────────────────────────
const WRIST_LEFT = 15;
const WRIST_RIGHT = 16;
/** Landmark visibility below this is treated as unreliable (matches overlay). */
const MIN_VISIBILITY = 0.4;
/** Moving-average half-window (samples) applied to position + speed. */
const SMOOTH_HALF = 1;
/** Address plateau = speed below this fraction of the swing's peak wrist speed. */
const ADDRESS_SPEED_FRAC = 0.15;
/** Shortest address stillness (seconds) that counts as a genuine setup hold. */
const MIN_ADDRESS_SEC = 0.3;
/** Wrists must rise at least this far (normalized y) above address to be a swing. */
const MIN_VERTICAL_EXCURSION = 0.08;
/** At impact the wrists must be back within this y-distance of address height. */
const IMPACT_HEIGHT_TOL = 0.12;
/** Need at least this fraction of samples with a usable wrist to trust the read. */
const MIN_VISIBLE_FRAC = 0.5;

export interface PoseSwingPhases {
  /** Which wrist drove the read (better-tracked of 15/16). */
  trackedWrist: 'left' | 'right';
  /** Timestamps (seconds, clip-relative). */
  addressRef: number;
  backswingStart: number;
  top: number;
  impact: number;
  followThroughStart: number;
  /** Whether the read is trustworthy enough to drive phase-weighted selection. */
  confident: boolean;
  /** If not confident, why (for the dev log / summary). */
  reason?: string;
  // ── diagnostics ──
  sampleDt: number;
  visibleFrac: number;
  addressY: number;
  apexY: number;
  peakSpeed: number;
}

interface Vec {
  x: number;
  y: number;
}

/**
 * Detect swing-phase boundaries from wrist motion. Never throws; on ambiguous
 * input it returns `confident: false` with a reason and best-effort timestamps,
 * so the caller can fall back to even distribution instead of producing garbage.
 */
export function detectSwingPhases(samples: PoseSample[]): PoseSwingPhases {
  const n = samples.length;
  const t = samples.map((s) => s.t);
  const sampleDt = medianDt(t);

  const fail = (reason: string, extra?: Partial<PoseSwingPhases>): PoseSwingPhases => ({
    trackedWrist: 'right',
    addressRef: t[0] ?? 0,
    backswingStart: t[0] ?? 0,
    top: t[Math.floor(n / 2)] ?? 0,
    impact: t[n - 1] ?? 0,
    followThroughStart: t[n - 1] ?? 0,
    confident: false,
    reason,
    sampleDt,
    visibleFrac: 0,
    addressY: 0,
    apexY: 0,
    peakSpeed: 0,
    ...extra,
  });

  if (n < 6) return fail('too few pose samples');

  // ── Pick the better-tracked wrist ─────────────────────────────────────────
  const leftVisible = countVisible(samples, WRIST_LEFT);
  const rightVisible = countVisible(samples, WRIST_RIGHT);
  const trackedWrist: 'left' | 'right' =
    rightVisible >= leftVisible ? 'right' : 'left';
  const primary = trackedWrist === 'right' ? WRIST_RIGHT : WRIST_LEFT;
  const backup = trackedWrist === 'right' ? WRIST_LEFT : WRIST_RIGHT;

  // ── Build the wrist position series, filling occlusions ────────────────────
  // Prefer the primary wrist; fall back to the other wrist per-frame; leave null
  // where neither is visible, then linearly interpolate the gaps.
  const raw: (Vec | null)[] = samples.map((s) => {
    const p = usable(s, primary);
    if (p) return p;
    const b = usable(s, backup);
    return b ?? null;
  });
  const visibleFrac = raw.filter((p) => p !== null).length / n;
  if (visibleFrac < MIN_VISIBLE_FRAC) {
    return fail('low wrist visibility', { trackedWrist, visibleFrac });
  }
  const pos = smoothVec(interpolate(raw), SMOOTH_HALF);

  // ── Speed (normalized units / second) ──────────────────────────────────────
  const speed = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1] || sampleDt;
    speed[i] = dist(pos[i], pos[i - 1]) / dt;
  }
  const speedSm = smooth(speed, SMOOTH_HALF);
  const peakSpeed = Math.max(...speedSm);
  if (peakSpeed <= 0) return fail('no wrist motion', { trackedWrist, visibleFrac });
  const speedThresh = peakSpeed * ADDRESS_SPEED_FRAC;

  // ── Address plateau: first sustained low-speed run ─────────────────────────
  const minAddrFrames = Math.max(2, Math.round(MIN_ADDRESS_SEC / sampleDt));
  let addrStart = -1;
  let addrEnd = -1;
  {
    let runStart = 0;
    let run = 0;
    for (let i = 0; i < n; i++) {
      if (speedSm[i] < speedThresh) {
        if (run === 0) runStart = i;
        run++;
        if (run >= minAddrFrames) {
          addrStart = runStart;
          addrEnd = i;
          break; // take the FIRST qualifying hold (pre-swing address)
        }
      } else {
        run = 0;
      }
    }
  }
  if (addrEnd < 0) {
    return fail('no address plateau', { trackedWrist, visibleFrac, peakSpeed });
  }
  const addressY = median(pos.slice(addrStart, addrEnd + 1).map((p) => p.y));

  // ── Backswing start: motion onset after the address hold ───────────────────
  let bsIdx = -1;
  for (let i = addrEnd + 1; i < n; i++) {
    if (speedSm[i] >= speedThresh) {
      bsIdx = i;
      break;
    }
  }
  if (bsIdx < 0) {
    return fail('no swing motion after address', {
      trackedWrist,
      visibleFrac,
      addressY,
      peakSpeed,
    });
  }

  // ── Top: vertical apex (min y) after backswing start ───────────────────────
  let topIdx = bsIdx;
  let apexY = pos[bsIdx].y;
  for (let i = bsIdx; i < n; i++) {
    if (pos[i].y < apexY) {
      apexY = pos[i].y;
      topIdx = i;
    }
  }
  if (addressY - apexY < MIN_VERTICAL_EXCURSION) {
    // Wrists never rose meaningfully → not a real (or fully-framed) swing.
    return fail('insufficient vertical excursion', {
      trackedWrist,
      visibleFrac,
      addressY,
      apexY,
      peakSpeed,
    });
  }

  // ── Impact: max hand speed after top, and back near address height ─────────
  let impactIdx = topIdx;
  let maxSpeed = -1;
  for (let i = topIdx + 1; i < n; i++) {
    if (speedSm[i] > maxSpeed) {
      maxSpeed = speedSm[i];
      impactIdx = i;
    }
  }
  const nearAddressHeight = Math.abs(pos[impactIdx].y - addressY) <= IMPACT_HEIGHT_TOL;

  // ── Follow-through start: just after impact ────────────────────────────────
  const ftIdx = Math.min(impactIdx + 1, n - 1);

  const ordered =
    addrEnd < bsIdx && bsIdx < topIdx && topIdx < impactIdx && impactIdx < n - 1;
  const confident = ordered && nearAddressHeight;
  const reason = confident
    ? undefined
    : !ordered
      ? 'phase ordering broke down'
      : 'impact not near address height';

  return {
    trackedWrist,
    addressRef: t[addrEnd],
    backswingStart: t[bsIdx],
    top: t[topIdx],
    impact: t[impactIdx],
    followThroughStart: t[ftIdx],
    confident,
    reason,
    sampleDt,
    visibleFrac,
    addressY,
    apexY,
    peakSpeed,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function usable(sample: PoseSample, idx: number): Vec | null {
  const p = sample.landmarks[idx];
  if (!p) return null;
  if (p.visibility !== undefined && p.visibility < MIN_VISIBILITY) return null;
  return { x: p.x, y: p.y };
}

function countVisible(samples: PoseSample[], idx: number): number {
  let c = 0;
  for (const s of samples) if (usable(s, idx)) c++;
  return c;
}

/** Fill null gaps by linear interpolation; clamp leading/trailing to nearest. */
function interpolate(raw: (Vec | null)[]): Vec[] {
  const n = raw.length;
  const out: Vec[] = new Array(n);
  let lastIdx = -1;
  for (let i = 0; i < n; i++) {
    if (raw[i]) {
      const cur = raw[i]!;
      if (lastIdx < 0) {
        for (let j = 0; j < i; j++) out[j] = cur; // leading gap
      } else if (lastIdx < i - 1) {
        const a = raw[lastIdx]!;
        const span = i - lastIdx;
        for (let j = lastIdx + 1; j < i; j++) {
          const f = (j - lastIdx) / span;
          out[j] = { x: a.x + (cur.x - a.x) * f, y: a.y + (cur.y - a.y) * f };
        }
      }
      out[i] = cur;
      lastIdx = i;
    }
  }
  if (lastIdx < n - 1 && lastIdx >= 0) {
    for (let j = lastIdx + 1; j < n; j++) out[j] = raw[lastIdx]!; // trailing gap
  }
  return out;
}

function smooth(v: number[], half: number): number[] {
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    let sum = 0;
    let k = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < v.length) {
        sum += v[j];
        k++;
      }
    }
    out[i] = sum / k;
  }
  return out;
}

function smoothVec(v: Vec[], half: number): Vec[] {
  const xs = smooth(v.map((p) => p.x), half);
  const ys = smooth(v.map((p) => p.y), half);
  return xs.map((x, i) => ({ x, y: ys[i] }));
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function medianDt(t: number[]): number {
  if (t.length < 2) return 1 / 15;
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) dts.push(t[i] - t[i - 1]);
  return median(dts) || 1 / 15;
}
