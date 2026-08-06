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
/**
 * Landmark visibility below this is treated as unreliable (matches overlay).
 * NOTE: this is NOT a filter on the position series any more — the hand position is a
 * visibility-WEIGHTED midpoint of both wrists and discards nothing (see below). The
 * threshold now only decides (a) which wrist is reported as `trackedWrist` and (b)
 * whether a frame counts toward `visibleFrac`, i.e. the "can we see the golfer at all"
 * guard. Using it to reject coordinates was the bug: MediaPipe's `visibility` is an
 * occlusion score, not a position-quality score.
 */
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
 * MINIMUM PEAK SPEED (normalized units/s). Below this the clip carries no real wrist
 * motion → no swing. A hard `<= 0` test is not enough: smoothing a perfectly still
 * clip leaves floating-point roundoff (~1e-16) in the speed series, which sneaks past
 * zero and yields a degenerate "valid" envelope. This epsilon rejects that noise while
 * sitting far below any genuine motion (real swing peaks are ~0.5–5).
 */
const MIN_PEAK_SPEED = 1e-6;
/**
 * START QUIET FLOOR (normalized wrist speed). Start = speed-based motion onset backed
 * up to the true departure from stillness: from the ADDRESS_SPEED_FRAC onset frame,
 * walk BACK while the previous frame's smoothed speed is still above this floor,
 * landing on the first frame of the contiguous moving run. Sits above dead-address
 * jitter but below the take-away ramp, so it catches the onset a couple of frames
 * before the ADDRESS_SPEED_FRAC threshold without reaching into the still address.
 * OSÄKER: 0.04 assumes dead-address speed stays under it; if a clip's address jitter
 * exceeds the floor the back-up could overshoot into the address hold. Field-tune.
 */
const START_QUIET_FLOOR = 0.04;

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
 * IMPACT ADDRESS TOLERANCE (normalized y). Impact = the frame on the downswing where
 * the wrists come NEAREST address height, accepted only if that closest approach is
 * within this tolerance. An exact crossing back THROUGH addressY is too strict: face-on
 * clips (different camera angle → different wrist Y-path) don't return exactly to the
 * address plateau at contact, so a strict crossing misses by a hair even on a clean
 * swing. Tighter than IMPACT_HEIGHT_TOL (which only gates the descending pass): the
 * nearest approach must be genuinely close, so a clip that never brings the wrists back
 * near address (e.g. clipped before contact) still yields no impact — the tolerance
 * must NOT make impact "always true".
 * RETUNED 0.05 → 0.07 against the weighted-midpoint signal (2026-08-06). At 15 fps the
 * exact contact frame is simply not in the data, so the closest SMOOTHED approach falls
 * a little short of address height. Measured on session-multi's three swings: 0.063,
 * 0.056 and (once its burst is admitted) a comparable value — all real contacts, all
 * rejected at 0.05. 0.07 clears them with ~10 % margin while staying well inside
 * IMPACT_HEIGHT_TOL (0.12), so a clip that never brings the hands back near address
 * still yields no impact. The tolerance must not make impact "always true"; verified by
 * dtl-clipped, which still returns impact = null.
 * OSÄKER: 0.07 is calibrated at 15 fps. A higher sampling rate would land closer to
 * true contact and could take this back down; re-measure if SAMPLE_FPS changes.
 */
const IMPACT_ADDRESS_TOL = 0.07;
/**
 * MINIMUM DOWNSWING TIME. A real top → impact is ~0.2–0.3 s. If the detected
 * impact lands sooner than this after the (local) top, the read has collapsed →
 * impact is rejected (null), leaving the pure uniform-in-envelope baseline.
 */
const MIN_DOWNSWING_SEC = 0.12;
/**
 * IMPACT END MARGIN (frames). An impact crossing pinned to — or within this many
 * frames of — the envelope end is a CLIP-CUTOFF ARTIFACT, not a real hit: a clip that
 * stops before contact leaves the wrists still descending, and the only "crossing"
 * near addressY is the last frame the detector could reach. Require a real gap between
 * the crossing and the envelope end, so an impact at the tail is rejected (impact
 * null → pure uniform baseline). Combined with the clippedTail guard below.
 */
const IMPACT_END_MARGIN_FRAMES = 2;

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
  /**
   * Better-tracked wrist (15/16) by total visibility. DIAGNOSTIC ONLY — the position
   * series is a weighted midpoint of BOTH wrists, so this names the dominant one, not
   * "the one that was used".
   */
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

  // ── Hand position = VISIBILITY-WEIGHTED MIDPOINT of both wrists ────────────
  // Both hands are on the same grip, so they are one physical object — track it as
  // one. Each frame's position is the visibility-weighted mean of the two wrists:
  //
  //     pos = (pL·vL + pR·vR) / (vL + vR)
  //
  // The well-tracked wrist dominates; the occluded one fades out smoothly. No
  // per-frame switching, no discarded frames, no interpolation over real data.
  //
  // This replaces `primary ?? backup`, a per-frame fallback that broke in three ways
  // at once (all measured on __fixtures__/session-multi.json, 63 s, 3 swings, and
  // dtl-full.json):
  //  1. OFFSET JUMPS. The wrists sit ~0.4 apart in normalized x. Through every
  //     follow-through the trail wrist is occluded and its `visibility` oscillates
  //     across MIN_VISIBILITY (measured 0.28 → 0.55 over ~0.7 s), so the series
  //     snapped between the two — a ~0.35 jump in x in ONE frame, an apparent speed
  //     of 2.23 (the clip's highest). The downswing search then locked onto that
  //     artefact instead of impact, after every swing. Removing it halves the peak:
  //     session-multi 2.229 → 1.173, dtl-full 1.710 → 0.978.
  //  2. TRUSTING AN OCCLUDED LANDMARK'S POSITION. MediaPipe keeps emitting smooth,
  //     plausible coordinates for a hidden wrist — in dtl-full the trail wrist glides
  //     x 0.204 → 0.553 at visibility 0.12–0.36 while the hands are in fact HELD at
  //     the finish. The lead wrist (visibility 0.50–0.71) shows the truth. Weighting
  //     by visibility is exactly the statement "believe the wrist we can see".
  //  3. WHICH WRIST IS RELIABLE CHANGES WITHIN THE SWING. Down-the-line: trail wrist
  //     at address, lead wrist at the finish, because the hidden one is behind the
  //     body. So no single-wrist series works either — it loses the finish, the very
  //     landmark ADR-002 anchors the envelope on (dtl-full finish 8.38 → 9.31).
  //
  // Measured effect on the envelope shape, which is the real win: session-multi's
  // swings now yield clean ~1.60 s envelopes ending at the follow-through apex,
  // instead of stretching a further ~1.1 s into the post-swing club-lowering.
  const leftVisible = countVisible(samples, WRIST_LEFT);
  const rightVisible = countVisible(samples, WRIST_RIGHT);
  const trackedWrist: 'left' | 'right' =
    rightVisible >= leftVisible ? 'right' : 'left';

  const raw: (Vec | null)[] = samples.map((s) => weightedHands(s));
  // Quality gate stays a VISIBILITY question even though the series no longer filters
  // on it: a frame counts as tracked when at least one wrist clears MIN_VISIBILITY.
  // Without this the fraction would be ~1.0 for any clip where MediaPipe emitted
  // landmarks at all, and the guard would stop guarding.
  const visibleFrac =
    samples.filter((s) => usable(s, WRIST_LEFT) || usable(s, WRIST_RIGHT)).length / n;
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
  if (peakSpeed < MIN_PEAK_SPEED) {
    return fail('no wrist motion', { trackedWrist, visibleFrac });
  }
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

  // ── Swing start: SPEED-based motion onset, backed up to departure from stillness ─
  // Wrist-Y vs the address-plateau mean is UNUSABLE as the start signal (ADR-002
  // follow-up "wrist-Y ... oanvändbar för start"): during a long address the wrist-Y
  // DRIFTS more than any sane tolerance (drift observed 0.380→0.425 over ~6.9 s), so a
  // bidirectional |y−addressY|>tol fires on the drift and a directional addressY−y>tol
  // needs the hands to RISE and only trips mid-backswing. SPEED separates cleanly:
  // wrist speed sits in the noise floor through the dead address, then ramps at the
  // true take-away. So: (1) onset = first frame at/above speedThresh (ADDRESS_SPEED_FRAC
  // ×peak), which lands slightly INTO the take-away; (2) back up frame-by-frame while
  // the previous frame is still moving above START_QUIET_FLOOR, landing on the first
  // frame of the contiguous moving run = the real departure from stillness. Early-
  // biased by design: prefer a couple of frames early over reaching into the backswing.
  let startIdx = -1;
  for (let i = addrEnd + 1; i < n; i++) {
    if (speedSm[i] >= speedThresh) {
      startIdx = i;
      break;
    }
  }
  if (startIdx >= 0) {
    while (startIdx > addrEnd + 1 && speedSm[startIdx - 1] > START_QUIET_FLOOR) {
      startIdx--;
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
  // Impact = the frame on the downswing where the wrists come NEAREST address height —
  // NOT an exact crossing back THROUGH addressY, and NEVER a fallback. A strict crossing
  // is too tight: face-on clips (different camera angle → different wrist Y-path) don't
  // return exactly to the address plateau at contact, so a clean swing misses the
  // crossing by a hair. Instead, over the descending pass [passIdx, finishIdx), take the
  // frame of closest approach to addressY and accept it only if that approach is within
  // IMPACT_ADDRESS_TOL. If the wrists never come that close (e.g. a clip that stops
  // before contact) there is no verified hit — impactIdx stays -1 (no fallback to
  // passIdx / max-vy / the last frame). passIdx (max descending speed) only anchors the
  // pass; it is NOT taken as impact.
  let impactIdx = -1;
  let nearestDist = Infinity;
  if (passIdx >= 0) {
    for (let i = Math.max(passIdx, startIdx + 1); i < finishIdx; i++) {
      const d = Math.abs(pos[i].y - addressY);
      if (d < nearestDist) {
        nearestDist = d;
        impactIdx = i; // closest approach to address height so far
      }
    }
    if (nearestDist > IMPACT_ADDRESS_TOL) impactIdx = -1; // never came near address
  }
  const tooFar = passIdx >= 0 && nearestDist > IMPACT_ADDRESS_TOL;
  // Reject an impact pinned to (or within IMPACT_END_MARGIN_FRAMES of) the envelope end
  // — a cutoff artifact, not a hit. And a clipped-tail clip can never carry a verified
  // impact: if the tail is clipped the swing did not complete, so any near-end approach
  // is untrustworthy. Either way impactIdx → -1 (impact stays null → uniform baseline).
  const atEnvelopeEnd = impactIdx >= 0 && finishIdx - impactIdx < IMPACT_END_MARGIN_FRAMES;
  if (impactIdx >= 0 && (atEnvelopeEnd || clippedTail)) {
    impactIdx = -1;
  }

  // Backswing top = highest point (min y) BEFORE impact — the follow-through, which is
  // after impact, cannot contaminate it.
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
    impactReason =
      passIdx < 0
        ? 'no descending pass near address height (no clear impact)'
        : clippedTail
          ? 'clipped tail: swing did not complete, impact unverifiable (no impact)'
          : atEnvelopeEnd
            ? 'nearest approach pinned to envelope end (cutoff artifact, no verified impact)'
            : tooFar
              ? `wrists never returned within ${IMPACT_ADDRESS_TOL} of address (nearest ${nearestDist.toFixed(3)}; no impact)`
              : 'no impact';
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

/**
 * Visibility-weighted midpoint of the two wrists — the hands as ONE object.
 * No visibility floor: a low-visibility wrist is down-weighted, not discarded, so a
 * partly-occluded frame still carries the half of the signal we can see. Returns null
 * only when MediaPipe emitted neither wrist at all (then interpolation fills the gap).
 * A landmark without a `visibility` field is treated as fully visible, matching
 * `usable()`.
 */
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
