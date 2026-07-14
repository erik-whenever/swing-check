// STEG 1 (Ström D, Pass 3 — envelope-inversion) — Swing ENVELOPE detection.
//
// The robust foundation for pose-driven frame selection. Given the pose
// trajectory FramePreview already computed (do NOT re-run pose), derive the
// swing envelope [start, finish] from the WRISTS (MediaPipe landmarks 15 = left,
// 16 = right), plus a CONFIDENT-ONLY impact timestamp layered on top.
//
// Why envelope-first (see docs/decisions/ADR-002): three rounds of phase-cluster
// patching showed that treating phase clustering as the PRIMARY path is brittle —
// every fix exposed the next layer. The key inversion: the follow-through FINISH
// (hands high, motion settled) is the MOST reliable landmark in a completed golf
// swing, not the least — it is the global vertical apex (min y). So we anchor on
// start→finish and distribute uniformly-in-time as the baseline (guarantees swing
// coverage incl. impact), and only add an impact cluster when impact detection is
// confident. Worst case degrades to "uniform over the swing" (useful), never to
// "missed impact" (worthless).
//
// Coordinate note: MediaPipe normalized coords have origin top-left with y growing
// DOWNWARD, so "wrists up" = smaller y and the vertical apex is the MINIMUM y.
//
// Pure + testable: takes PoseSample[] in, returns an envelope out. Selection
// signal only — no club, no swing-plane math, no rule evaluation.

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
/** Need at least this fraction of samples with a usable wrist to trust the read. */
const MIN_VISIBLE_FRAC = 0.5;

// ── Finish / settle tunables ───────────────────────────────────────────────────
/**
 * SETTLE VELOCITY THRESHOLD. After the follow-through finish the hands are held
 * high and (nearly) still. We confirm a genuine settle-finish when wrist speed
 * drops below this fraction of peak speed for a short run AFTER the vertical apex.
 * If it never settles, the swing was clipped mid-motion → clip-cutoff protection.
 */
const SETTLE_SPEED_FRAC = 0.2;
/** Consecutive low-speed samples after the apex that confirm a settle-finish. */
const SETTLE_MIN_FRAMES = 2;
/**
 * The finish is HELD, so min-y is a flat plateau, not a single point. Treat any
 * frame within this (normalized y) tolerance of the global min as "at the finish"
 * and take the EARLIEST such frame as the finish onset — the raw argmin drifts to
 * the last plateau frame on float noise alone and buries the finish in a dead tail.
 */
const APEX_PLATEAU_TOL = 0.02;

// ── Impact tunables (confident-only polish) ────────────────────────────────────
/** Wrists must rise at least this far (normalized y) above address to be a swing. */
const MIN_VERTICAL_EXCURSION = 0.08;
/** At impact the wrists must be back within this y-distance of address height. */
const IMPACT_HEIGHT_TOL = 0.12;
/**
 * MINIMUM DOWNSWING TIME. A real top → impact is ~0.2–0.3 s. If the detected
 * impact lands sooner than this after the (local) top, the read has collapsed →
 * impact is rejected (null), leaving the pure uniform-in-envelope baseline.
 */
const MIN_DOWNSWING_SEC = 0.12;

export interface EnvelopeImpact {
  /** Backswing top (local vertical apex BEFORE the finish), seconds. */
  topSec: number;
  /** Detected impact (fastest descending wrist between top and finish), seconds. */
  timeSec: number;
  /** top → impact duration (seconds); must clear MIN_DOWNSWING_SEC. */
  downswingSec: number;
}

export interface SwingEnvelope {
  /** False → no usable envelope; caller falls back to even-over-span. */
  valid: boolean;
  /** If not valid, why (for the dev log / summary). */
  reason?: string;
  /** Swing start = sustained wrist-motion onset after the address hold, seconds. */
  startSec: number;
  /** Swing finish = settle-finish (apex) or clip-protected last-motion, seconds. */
  finishSec: number;
  /** True when no settle-finish was found and clip-cutoff protection set finish. */
  clippedTail: boolean;
  /** Confident impact timestamp, or null when the read is ambiguous/collapsed. */
  impact: EnvelopeImpact | null;
  /** Why impact was or wasn't accepted (for the log), even when impact is null. */
  impactReason: string;
  // ── diagnostics ──
  /** Which wrist drove the read (better-tracked of 15/16). */
  trackedWrist: 'left' | 'right';
  visibleFrac: number;
  sampleDt: number;
  addressY: number;
  /** y of the backswing top (local apex). */
  apexY: number;
  /** y of the finish landmark (global apex, or clip-protected end). */
  finishY: number;
  peakSpeed: number;
  /** Per-frame trace + picked indices (for the STEG 1 verification log). */
  debug?: EnvelopeDebug;
}

/** Per-sample instrumentation so the dev log can show WHERE the real speed peak
 *  lies vs where the detector placed impact. `vy` is signed vertical speed
 *  (normalized units/s), positive = moving DOWN toward address height. */
export interface EnvelopeDebug {
  frames: { t: number; y: number; vy: number; speed: number }[];
  addrEndIdx: number;
  startIdx: number;
  topIdx: number;
  finishIdx: number;
  impactIdx: number;
  clippedTail: boolean;
}

interface Vec {
  x: number;
  y: number;
}

/**
 * Detect the swing envelope [start, finish] from wrist motion, plus a
 * confident-only impact. Never throws; on ambiguous input it returns
 * `valid: false` with a reason so the caller can fall back to even distribution.
 */
export function detectSwingEnvelope(samples: PoseSample[]): SwingEnvelope {
  const n = samples.length;
  const t = samples.map((s) => s.t);
  const sampleDt = medianDt(t);

  const fail = (reason: string, extra?: Partial<SwingEnvelope>): SwingEnvelope => ({
    valid: false,
    reason,
    startSec: t[0] ?? 0,
    finishSec: t[n - 1] ?? 0,
    clippedTail: false,
    impact: null,
    impactReason: 'no envelope',
    trackedWrist: 'right',
    visibleFrac: 0,
    sampleDt,
    addressY: 0,
    apexY: 0,
    finishY: 0,
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
  // total = magnitude of wrist displacement; vy = signed vertical component
  // (positive = descending toward address height, since y grows downward).
  const speed = new Array<number>(n).fill(0);
  const vy = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1] || sampleDt;
    speed[i] = dist(pos[i], pos[i - 1]) / dt;
    vy[i] = (pos[i].y - pos[i - 1].y) / dt;
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

  // ── Swing start: motion onset after the address hold ───────────────────────
  let startIdx = -1;
  for (let i = addrEnd + 1; i < n; i++) {
    if (speedSm[i] >= speedThresh) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) {
    return fail('no swing motion after address', {
      trackedWrist,
      visibleFrac,
      addressY,
      peakSpeed,
    });
  }

  // ── Finish: the vertical apex (min y) after start, WITH a settle ────────────
  // The follow-through finish puts the hands highest in a completed swing, so the
  // global min y after motion onset IS the finish — the very landmark the earlier
  // phase read mistook for the backswing "top". We use it correctly here. Because
  // the finish is HELD (a flat min-y plateau), we take the EARLIEST frame within a
  // small tolerance of the global min, not the raw argmin: a raw argmin drifts to
  // the last plateau frame (float noise in the moving average alone is enough) and
  // lands the finish deep in a dead tail, defeating the settle check.
  let globalApexY = pos[startIdx].y;
  for (let i = startIdx; i < n; i++) {
    if (pos[i].y < globalApexY) globalApexY = pos[i].y;
  }
  let apexIdx = startIdx;
  for (let i = startIdx; i < n; i++) {
    if (pos[i].y <= globalApexY + APEX_PLATEAU_TOL) {
      apexIdx = i; // finish ONSET = first frame reaching the held-high plateau
      break;
    }
  }

  // Settle check: a short low-speed run AFTER the apex confirms a held finish.
  const settleThresh = peakSpeed * SETTLE_SPEED_FRAC;
  let settled = false;
  {
    let quiet = 0;
    for (let i = apexIdx + 1; i < n; i++) {
      if (speedSm[i] < settleThresh) {
        quiet++;
        if (quiet >= SETTLE_MIN_FRAMES) {
          settled = true;
          break;
        }
      } else {
        quiet = 0;
      }
    }
  }

  // Clip-cutoff protection: if the apex never settles (video ends mid-motion),
  // set the envelope end to the LAST frame with significant wrist motion, not the
  // literal clip end — avoids a dead tail of the golfer walking out of frame.
  let finishIdx = apexIdx;
  let clippedTail = false;
  if (!settled) {
    clippedTail = true;
    let lastMotion = startIdx;
    for (let i = startIdx; i < n; i++) {
      if (speedSm[i] > speedThresh) lastMotion = i;
    }
    finishIdx = Math.max(apexIdx, lastMotion);
  }
  const finishY = pos[finishIdx].y;

  // ── Impact (confident-only polish) ─────────────────────────────────────────
  // Impact is the fastest DESCENDING wrist (vy > 0, moving back DOWN toward
  // address height) that is back NEAR address height — the bottom of the
  // downswing. We find it directly rather than via a "min-y before finish" top:
  // in a real swing the follow-through rises HIGHER than the backswing top, so the
  // min-y before the finish sits in the follow-through, not at the top. The top is
  // then simply the apex (min y) BEFORE this impact — the follow-through, which is
  // after impact, cannot contaminate it.
  let impactIdx = -1;
  let maxDescSpeed = -1;
  for (let i = startIdx + 1; i < finishIdx; i++) {
    if (vy[i] <= 0) continue; // must be descending toward address height
    if (Math.abs(pos[i].y - addressY) > IMPACT_HEIGHT_TOL) continue; // near address
    if (speedSm[i] > maxDescSpeed) {
      maxDescSpeed = speedSm[i];
      impactIdx = i;
    }
  }

  // Backswing top = highest point (min y) BEFORE impact. Kept for diagnostics /
  // confidence even when impact is ultimately rejected.
  let topIdx = startIdx;
  let topY = pos[startIdx].y;
  for (let i = startIdx; i < Math.max(startIdx + 1, impactIdx); i++) {
    if (pos[i].y < topY) {
      topY = pos[i].y;
      topIdx = i;
    }
  }

  // Evaluate impact confidence. Any failure → impact stays null (pure baseline).
  let impact: EnvelopeImpact | null = null;
  let impactReason: string;
  if (impactIdx < 0) {
    impactReason = 'no descending pass near address height (no clear impact)';
  } else if (addressY - topY < MIN_VERTICAL_EXCURSION) {
    impactReason = 'insufficient vertical excursion (no real backswing top)';
  } else {
    const downswingSec = t[impactIdx] - t[topIdx];
    if (downswingSec < MIN_DOWNSWING_SEC) {
      impactReason = `downswing too short (${downswingSec.toFixed(2)}s < ${MIN_DOWNSWING_SEC}s)`;
    } else {
      impact = { topSec: t[topIdx], timeSec: t[impactIdx], downswingSec };
      impactReason = `confident (dsSec=${downswingSec.toFixed(2)})`;
    }
  }

  return {
    valid: true,
    startSec: t[startIdx],
    finishSec: t[finishIdx],
    clippedTail,
    impact,
    impactReason,
    trackedWrist,
    visibleFrac,
    sampleDt,
    addressY,
    apexY: topY,
    finishY,
    peakSpeed,
    debug: {
      frames: pos.map((p, i) => ({ t: t[i], y: p.y, vy: vy[i], speed: speedSm[i] })),
      addrEndIdx: addrEnd,
      startIdx,
      topIdx,
      finishIdx,
      impactIdx,
      clippedTail,
    },
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
