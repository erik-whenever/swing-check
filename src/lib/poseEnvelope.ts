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
/**
 * ADDRESS DEPARTURE TOLERANCE. Swing start = the frame where the wrist LEAVES the
 * still address position — the first frame whose vertical position deviates from
 * the address-plateau mean by more than this (normalized y). Take-away is slow and
 * soft, so a SPEED threshold (backswing velocity) fires late, after the club has
 * already lifted, clipping the take-away; anchoring start on DEPARTURE from the
 * address plateau instead catches motion onset at the true start of the swing.
 */
const ADDRESS_DEPART_TOL = 0.03;
// NOTE: no waggle filter. Two attempts to reject pre-swing waggle by requiring a
// SUSTAINED (START_MIN_SUSTAIN_FRAMES) or lookahead-confirmed (WAGGLE_LOOKAHEAD_
// FRAMES) departure both fired start catastrophically late in DTL clips: there the
// take-away moves the hands almost straight BACK, not up, so the y-only departure
// signal barely clears the tolerance and any y-based waggle test reads the slow
// take-away as a waggle return and rejects it. Y-only is the wrong signal for
// take-away start. Per ADR-002 (a late start loses the whole take-away; a few
// early address frames are cheap), start is the FIRST address departure, unfiltered
// — early-biased by design. See ADR-002 follow-up + docs/pose-detection.md.

// ── Finish / settle tunables ───────────────────────────────────────────────────
/**
 * SETTLE VELOCITY THRESHOLD. In the held follow-through finish the hands are high
 * and (nearly) still. We confirm the finish when wrist speed drops below this
 * fraction of peak speed AFTER the downswing pass. If it never settles, the swing
 * was clipped mid-motion → clip-cutoff protection.
 */
const SETTLE_SPEED_FRAC = 0.2;
/**
 * MINIMUM FINISH HOLD (consecutive low-speed samples). Structural discriminator:
 * the follow-through finish is posed and HELD across many frames, whereas the
 * backswing top is a brief transition of only a few frames. Requiring a longer
 * hold stops a short low-speed dwell at the top from being read as the finish —
 * the exact collapse this replaces (finish snapping back to the backswing top,
 * because backswing-top and finish are near-equal wrist-height maxima).
 * OSÄKER: 3 frames ≈ 0.2 s at ~15 fps; a very fast finish that is barely held
 * could still fall through to clip-cutoff protection. Field-tune on real clips.
 */
const FINISH_MIN_HOLD_FRAMES = 3;

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

  // ── Swing start: FIRST departure from the address plateau (early-biased) ─────
  // Not "onset of backswing speed": take-away is slow and soft, so wrist speed
  // stays below the backswing threshold until the backswing accelerates, which
  // places start AFTER the take-away (club already lifted). Instead start = the
  // FIRST frame whose wrist departs the address plateau in the take-away direction
  // (above address by > tol). No waggle filter: in DTL the take-away moves the
  // hands almost straight BACK, so the y-only departure barely clears the tolerance
  // and any y-based waggle test (sustain OR lookahead-return) misreads the slow
  // take-away as a waggle and rejects it, firing start near the backswing top —
  // catastrophically late. Per ADR-002 a late start loses the whole take-away
  // whereas a few early address frames are cheap, so we bias EARLY and accept that
  // a real waggle may add a handful of leading address frames.
  let startIdx = -1;
  for (let i = addrEnd + 1; i < n; i++) {
    // departed in the take-away direction (above address by > tol)?
    if (addressY - pos[i].y > ADDRESS_DEPART_TOL) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) {
    return fail('no departure from address plateau', {
      trackedWrist,
      visibleFrac,
      addressY,
      peakSpeed,
    });
  }

  // ── Downswing pass (impact) — found FIRST; the finish is defined by SEQUENCE ──
  // The finish is NOT "the highest point": in a completed swing the backswing top
  // and the follow-through finish are near-equal wrist-height maxima (hands up by
  // the head in both), so global min-y is ambiguous and snaps the finish back to
  // the earlier top — the collapse this replaces (envelope shrinks to the backswing
  // only, and the impact search, bounded by that false finish, finds no descending
  // pass). Instead we anchor on the swing ORDER: backswing top → DOWNSWING PASS
  // (wrists descend back near address height) → finish (held high-settle AFTER the
  // pass). So we locate the downswing pass first: the fastest DESCENDING wrist
  // (vy > 0) back near address height, over the whole post-start range.
  // OSÄKER: searches the full clip, not up to a (now pass-derived) finish. A
  // post-finish lowering of the club is also a descending pass near address height,
  // but slower than impact, so fastest-wins still lands on the real downswing —
  // weak only if a clip contains a second, faster near-address dip after the swing.
  let passIdx = -1;
  let maxDescSpeed = -1;
  for (let i = startIdx + 1; i < n; i++) {
    if (vy[i] <= 0) continue; // must be descending toward address height
    if (Math.abs(pos[i].y - addressY) > IMPACT_HEIGHT_TOL) continue; // near address
    if (speedSm[i] > maxDescSpeed) {
      maxDescSpeed = speedSm[i];
      passIdx = i;
    }
  }

  // ── Finish: first sustained high-settle AFTER the downswing pass ───────────────
  // Walk forward from the pass; the finish onset is the start of the first run of
  // FINISH_MIN_HOLD_FRAMES low-speed samples (the held follow-through pose). The
  // hold-length requirement is what separates the finish from the brief low-speed
  // dwell at the backswing top — a top would clear a 1–2 frame settle but not this.
  const settleThresh = peakSpeed * SETTLE_SPEED_FRAC;
  let finishIdx = -1;
  let clippedTail = false;
  if (passIdx >= 0) {
    let quiet = 0;
    let runStart = passIdx + 1;
    for (let i = passIdx + 1; i < n; i++) {
      if (speedSm[i] < settleThresh) {
        if (quiet === 0) runStart = i;
        quiet++;
        if (quiet >= FINISH_MIN_HOLD_FRAMES) {
          finishIdx = runStart; // finish ONSET = first frame of the held-high run
          break;
        }
      } else {
        quiet = 0;
      }
    }
  }

  // Clip-cutoff protection: no downswing pass found, or the follow-through never
  // settles (video ends mid-motion) → set the envelope end to the LAST frame with
  // significant wrist motion, not the literal clip end (avoids a dead tail of the
  // golfer walking out of frame).
  if (finishIdx < 0) {
    clippedTail = true;
    let lastMotion = startIdx;
    for (let i = startIdx; i < n; i++) {
      if (speedSm[i] > speedThresh) lastMotion = i;
    }
    finishIdx = Math.max(passIdx >= 0 ? passIdx : startIdx, lastMotion);
  }
  const finishY = pos[finishIdx].y;

  // ── Impact (confident-only polish) ─────────────────────────────────────────
  // The downswing pass IS the impact candidate (bottom of the downswing, back near
  // address height). Backswing top = highest point (min y) BEFORE that pass — the
  // follow-through, which is after impact, cannot contaminate it.
  const impactIdx = passIdx;
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
