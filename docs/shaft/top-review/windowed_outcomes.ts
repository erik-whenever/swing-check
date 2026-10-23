// ONE-OFF, READ-ONLY (S-40): stdin JSON -> stdout JSON. Like S-39's
// `verdict_outcomes.ts`, the ONLY thing this file does is drive the PRODUCTION
// measurement layer and write down what it answered. It is a SECOND file rather than an
// edit of that one, so S-39 keeps running on exactly the bridge it ran on.
//
// WHAT IS NEW HERE, AND WHY IT IS STILL PRODUCTION'S OWN ARITHMETIC. The question is
// whether reading the top over a WINDOW of frames is steadier than reading it on one.
// "Median over the window" is not invented here:
//
//   `shaftAngleByPhase` in `derived.ts` ALREADY aggregates the `top` bucket over every
//   admitted, OBSERVED `top` frame, with `circularMedianDeg` from `angles.ts`. Labelling
//   a window of frames `top`/`observed` therefore makes production compute the windowed
//   median itself -- no new estimator, no new threshold, no new distance function.
//
//   `circularMedianDeg` is a MEDOID: its answer is one of the input angles, so the
//   windowed median names a FRAME. That frame is then handed back to production as the
//   single observed top, and `topShaftOrientation` and `shaftPositionAtP4` answer on it
//   through their own unmodified path -- the near-vertical gate, the on-plane band, the
//   camera gate, the handedness requirement and S-30's `top-phase-not-observed` rule all
//   run exactly as they ship. `usableFrameIndices` and `circularMedianDeg` are IMPORTED,
//   never re-derived, and no constant in this file is a literal copy of a production one.
//
// AT WIDTH 1 THE WINDOW IS THE FRAME, so width 1 must reproduce S-39 row for row. That is
// the control, and `windowed_tso.py` prints it before anything else.
//
// A SECOND AGGREGATOR IS CARRIED AS A CONTROL, NOT AS A CANDIDATE: the majority vote over
// the window's per-frame production verdicts. It is reported so the reader can see whether
// the answer depends on which aggregator was chosen. Nothing is chosen here.
//
// ONE MEASURED SHORTCUT. `checkShaftSeries` never reads `frame.phase` (plausibility.ts has
// no `.phase` anywhere), so the per-frame quality is independent of which frame carries
// `top`. This file therefore checks a swing's series ONCE and re-labels the phases in
// place between readings -- and PROVES the assumption per swing by checking a second
// labelling against the first, stopping if they differ.
//
// NOTHING IS DECIDED HERE. No threshold, no estimator, no calibration, no shift, no change
// to S-30's gate, no production code written. The production files are read (imported).
//
// Build + run (esbuild, the same pattern as verdict_outcomes.ts):
//   node_modules/.bin/esbuild docs/shaft/top-review/windowed_outcomes.ts \
//       --bundle --platform=node --format=esm --outfile=<tmp>/windowed_outcomes.mjs
//   node <tmp>/windowed_outcomes.mjs < <tmp>/in.json > <tmp>/out.json
import { readFileSync } from 'node:fs';
import { KEYPOINT_THRESHOLD } from '../../../packages/core/src/lib/shaft/shaftPostprocess';
import type { ShaftDetection, ShaftPoint } from '../../../src/lib/shaft/shaftDetector';
import type { CameraAngle } from '../../../packages/core/src/lib/cameraAngle';
import {
  buildShaftSwingSeries,
  checkShaftSeries,
  buildShaftMeasurements,
  usableFrameIndices,
  circularMedianDeg,
  angleDifference,
  type CheckedShaftSwingSeries,
  type DetectedFrame,
  type Handedness,
  type MeasurementPhase,
} from '../../../src/lib/shaft/measure';
// FRAGA 3 drives production's OWN frame selector. `ANALYSIS_FRAME_COUNT` and
// `selectEnvelopeFrames` are the app's, imported rather than described.
import { ANALYSIS_FRAME_COUNT } from '../../../src/lib/frameExtractor';
import { selectEnvelopeFrames } from '../../../src/lib/poseEnvelopeSelection';
import type { SwingEnvelope } from '../../../src/lib/poseEnvelope';

// ── What the Python side hands over ──────────────────────────────────────────

interface InFrame {
  t: number;
  bx?: number;
  by?: number;
  bs?: number;
  hx?: number;
  hy?: number;
  hs?: number;
  lm?: Record<string, [number, number, number]>;
}

interface InWindow {
  /** The candidate top, 0-based into `frames`. */
  index: number;
  label: string;
  /** Odd widths, centred on `index`. */
  widths: number[];
}

interface InSwing {
  id: string;
  clip: string;
  swingIndex: number;
  cameraAngle: CameraAngle | null;
  imageSize: { width: number; height: number };
  modelFile: string;
  frames: InFrame[];
  windows: InWindow[];
}

/** FRAGA 3: one entry per swing whose production grid is to be recomputed. */
interface InGrid {
  id: string;
  startSec: number;
  finishSec: number;
  /** Production's own `impactSec`, or null when the envelope carried no confident impact. */
  impactSec: number | null;
  /**
   * LABEL ONLY, and it is an estimator's output, not a measurement. `labelPhase` needs a
   * `topSec` to name a pick `top`; `phaseCentre` never reads it unless the caller asks for
   * a `top` cluster, and the clip path does not. It therefore cannot move a pick's
   * timestamp -- only what that pick is called. Stated in the report.
   */
  topSecForLabelOnly: number | null;
  /** Production pose sampling step, seconds. Feeds `PHASE_LABEL_TOL_SEC`'s floor only. */
  sampleDt: number;
  clippedTail: boolean;
}

interface Input {
  handedness: Handedness;
  swings: InSwing[];
  grid: InGrid[];
}

// ── Adapters (identical in construction to verdict_outcomes.ts) ──────────────

function point(
  x: number | undefined,
  y: number | undefined,
  s: number | undefined,
): ShaftPoint | null {
  if (x === undefined || y === undefined || s === undefined) return null;
  if (s < KEYPOINT_THRESHOLD) return null;
  return { x, y, conf: s };
}

function detection(f: InFrame, imageSize: { width: number; height: number }): ShaftDetection {
  return {
    butt: point(f.bx, f.by, f.bs),
    hosel: point(f.hx, f.hy, f.hs),
    toe: null,
    heel: null,
    boxConf: f.bs === undefined ? 0 : 1,
    inferenceMs: 0,
    preprocessMs: 0,
    imageSize,
    provider: 'wasm',
    modelKeypoints: 2,
  };
}

function landmarks(f: InFrame) {
  if (!f.lm) return null;
  const out = new Array(33).fill(undefined);
  for (const [k, v] of Object.entries(f.lm)) {
    out[Number(k)] = { x: v[0], y: v[1], z: 0, visibility: v[2] };
  }
  return out as never;
}

function mkFrames(s: InSwing): DetectedFrame[] {
  return s.frames.map((f) => ({
    tSec: f.t,
    phase: 'backswing' as MeasurementPhase,
    phaseSource: 'envelope-fallback',
    detection: detection(f, s.imageSize),
    landmarks: landmarks(f),
  }));
}

function mkChecked(s: InSwing, frames: DetectedFrame[]): CheckedShaftSwingSeries {
  return checkShaftSeries(
    buildShaftSwingSeries(frames, {
      clipName: s.clip,
      swingIndex: s.swingIndex,
      cameraAngle: s.cameraAngle,
      modelFile: s.modelFile,
      producedAt: '2026-09-19T00:00:00.000Z',
    }),
  );
}

/** `backswing` … `top` on [lo, hi], observed … `downswing`. */
function relabel(checked: CheckedShaftSwingSeries, lo: number, hi: number): void {
  const fs = checked.series.frames;
  for (let i = 0; i < fs.length; i++) {
    fs[i].phase = i < lo ? 'backswing' : i > hi ? 'downswing' : ('top' as MeasurementPhase);
    fs[i].phaseSource = i >= lo && i <= hi ? 'observed' : 'envelope-fallback';
  }
}

function readOut(checked: CheckedShaftSwingSeries, handedness: Handedness, at: number) {
  const m = buildShaftMeasurements(checked, { handedness });
  const p4 = m.shaftPositionAtP4;
  const tso = m.topShaftOrientation;
  const sabp = m.shaftAngleByPhase;
  const top = sabp.value?.top ?? null;
  return {
    frameUsable: checked.quality.frames[at].shaftAngle.level,
    frameReasons: checked.quality.frames[at].shaftAngle.reasons,
    p4: {
      answers: p4.value !== null,
      level: p4.quality.level,
      reasons: p4.quality.reasons,
      orientationDeg: p4.value?.orientationDeg ?? null,
    },
    tso: {
      answers: tso.value !== null,
      level: tso.quality.level,
      reasons: tso.quality.reasons,
      category: tso.value?.category ?? null,
      deviationDeg: tso.value?.deviationDeg ?? null,
      distanceToVerticalDeg: tso.value?.distanceToVerticalDeg ?? null,
    },
    sabp: {
      answers: top !== null,
      level: sabp.quality.level,
      reasons: sabp.quality.reasons,
      topMedianDeg: top?.medianDeg ?? null,
      topLevel: top?.level ?? null,
      topN: top?.n ?? null,
    },
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const input: Input = JSON.parse(readFileSync(0, 'utf8'));
const out: unknown[] = [];

for (const s of input.swings) {
  const checked = mkChecked(s, mkFrames(s));
  const n = checked.series.frames.length;
  relabel(checked, 0, 0);

  // PROVE the shortcut rather than assume it: a second labelling must produce the same
  // per-frame quality, or the cached `checked` is not reusable and this stops.
  const qa = JSON.stringify(checked.quality);
  const altFrames = mkFrames(s);
  for (let i = 0; i < altFrames.length; i++) {
    altFrames[i].phase = i === n - 1 ? 'top' : 'backswing';
    altFrames[i].phaseSource = i === n - 1 ? 'observed' : 'envelope-fallback';
  }
  if (JSON.stringify(mkChecked(s, altFrames).quality) !== qa) {
    process.stderr.write('kvaliteten beror pa fasetiketten for ' + s.id + ' -- stoppar\n');
    process.exit(2);
  }

  const admitted = new Set(usableFrameIndices(checked, 'shaft'));
  const angles: (number | null)[] = checked.series.frames.map((f) => f.shaftAngleDeg);

  // Every single-frame reading, once. Everything below is a lookup into this.
  const perFrame: unknown[] = [];
  for (let i = 0; i < n; i++) {
    relabel(checked, i, i);
    perFrame.push({ index: i, ...readOut(checked, input.handedness, i) });
  }

  const windows: unknown[] = [];
  for (const w of s.windows) {
    for (const width of w.widths) {
      if (w.index < 0 || w.index >= n) {
        windows.push({ label: w.label, index: w.index, width, outside: true });
        continue;
      }
      const half = (width - 1) / 2;
      // Clipped to the envelope: a frame that does not exist cannot be detected, and
      // pretending otherwise would measure a window production could never read.
      const lo = Math.max(0, w.index - half);
      const hi = Math.min(n - 1, w.index + half);
      const inWindow: number[] = [];
      for (let i = lo; i <= hi; i++) if (admitted.has(i) && angles[i] !== null) inWindow.push(i);

      // Production's own median over the window: label the window `top`/`observed` and
      // let `shaftAngleByPhase` do it.
      relabel(checked, lo, hi);
      const wm = buildShaftMeasurements(checked, { handedness: input.handedness });
      const topBucket = wm.shaftAngleByPhase.value?.top ?? null;

      // The medoid names a frame. `circularMedianDeg` is production's, imported.
      const med = circularMedianDeg(inWindow.map((i) => angles[i] as number));
      const hits = med === null ? [] : inWindow.filter((i) => angles[i] === med);
      const medianIndex = hits.length > 0 ? hits[0] : null;
      // WHAT THE MEDIAN ACTUALLY FILTERS, counted rather than claimed. `circularMedianDeg`
      // works in the DIRECTED space (`butt -> hosel`), where a swapped pair of endpoints
      // shows up as ~180deg -- the outlier its own docstring says it exists to outvote. A
      // count of such frames per window says whether the aggregation had anything to do,
      // and how far the rest of the window sat from the frame it chose.
      const outliers =
        med === null
          ? 0
          : inWindow.filter((i) => angleDifference(angles[i] as number, med) > 90).length;
      const spread =
        med === null
          ? null
          : Math.max(0, ...inWindow.map((i) => angleDifference(angles[i] as number, med)));
      // Cross-check: the frame the medoid names must carry the angle production's own
      // `top` bucket reported. If it does not, the two constructions have drifted apart.
      if (topBucket && medianIndex !== null && topBucket.medianDeg !== angles[medianIndex]) {
        process.stderr.write('medoiden och top-hinken ar oense for ' + s.id + ' -- stoppar\n');
        process.exit(2);
      }

      windows.push({
        label: w.label,
        index: w.index,
        width,
        lo,
        hi,
        nFrames: hi - lo + 1,
        nAdmitted: inWindow.length,
        medianIndex,
        ties: hits.length,
        outliers,
        spread,
        // The WINDOW's own answer for the top bucket -- its level is `usable` only when
        // every admitted window frame was, which the single-frame reading cannot say.
        sabpWindow: {
          answers: topBucket !== null,
          level: wm.shaftAngleByPhase.quality.level,
          reasons: wm.shaftAngleByPhase.quality.reasons,
          topMedianDeg: topBucket?.medianDeg ?? null,
          topLevel: topBucket?.level ?? null,
          topN: topBucket?.n ?? null,
        },
      });
    }
  }
  out.push({ id: s.id, nFrames: n, perFrame, windows });
}

// ── FRAGA 3: production's own frame grid ─────────────────────────────────────

const grids: unknown[] = [];
for (const g of input.grid) {
  const topSec = g.topSecForLabelOnly ?? (g.impactSec === null ? null : (g.startSec + g.impactSec) / 2);
  const env: SwingEnvelope = {
    valid: true,
    startSec: g.startSec,
    finishSec: g.finishSec,
    clippedTail: g.clippedTail,
    impact:
      g.impactSec === null || topSec === null
        ? null
        : { topSec, timeSec: g.impactSec, downswingSec: g.impactSec - topSec },
    impactReason: 'supplied',
    trackedWrist: 'right',
    visibleFrac: 1,
    sampleDt: g.sampleDt,
    addressY: 0,
    apexY: 0,
    finishY: 0,
    peakSpeed: 0,
  };
  // The clip path passes NO `clusterPhases` (shaftPreview.ts and frameExtractor.ts both
  // call it bare), so this call is bare too -- the default is a cluster on impact.
  const sel = selectEnvelopeFrames(env, ANALYSIS_FRAME_COUNT, g.startSec, g.finishSec);
  grids.push({
    id: g.id,
    budget: ANALYSIS_FRAME_COUNT,
    requested: sel.requested,
    picks: sel.picks,
    allocation: sel.allocation,
    clusterPhases: sel.clusterPhases,
    impactClusterApplied: sel.impactClusterApplied,
    usedEnvelope: sel.usedEnvelope,
    fellBackToEven: sel.fellBackToEven,
  });
}

process.stdout.write(JSON.stringify({ swings: out, grid: grids, budget: ANALYSIS_FRAME_COUNT }));
