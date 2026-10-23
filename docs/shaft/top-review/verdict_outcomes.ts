// ONE-OFF, READ-ONLY (S-39): stdin JSON -> stdout JSON. The ONLY thing this file does is
// drive the PRODUCTION measurement layer and write down what it answered.
//
// WHY A TS BRIDGE AT ALL. The question is "does the OUTCOME change", and an outcome is
// whatever `src/lib/shaft/measure/` says it is -- the near-vertical gate, the on-plane
// band, the camera gate, the handedness requirement, the plausibility flags and S-30's
// `top-phase-not-observed` rule all sit there. Re-implementing any of that in Python
// would be measuring a copy. So `buildShaftSwingSeries`, `checkShaftSeries` and
// `buildShaftMeasurements` are IMPORTED and called; nothing in this file re-derives a
// threshold, and `KEYPOINT_THRESHOLD` is imported rather than written as 0.5.
//
// NOTHING IS DECIDED HERE. No threshold, no estimator, no calibration. The production
// files are read (imported) and not written.
//
// TWO THINGS THIS FILE DOES DECIDE, and both are stated in the report:
//   1. `handedness` arrives from the caller. It is `unknown` on all 103 swings
//      (docs/shaft/STATUS.md section 4), so `top-shaft-orientation` rejects every swing
//      outright in production. To have an outcome to move at all, the caller passes one
//      and the report says so in plain words.
//   2. The SERIES is the swing's envelope frames, and the phase labelling is built
//      around the candidate top: `backswing` before it, `top` (phaseSource `observed`)
//      on it, `downswing` after. That is the controlled experiment -- exactly one thing
//      moves between two runs of the same swing, the frame that carries `top`.
//
// Build + run (esbuild, the same pattern as phase-audit/select.ts and
// top-from-signal/analyze.ts):
//   node_modules/.bin/esbuild docs/shaft/top-review/verdict_outcomes.ts \
//       --bundle --platform=node --format=esm --outfile=<tmp>/verdict_outcomes.mjs
//   node <tmp>/verdict_outcomes.mjs < <tmp>/in.json > <tmp>/out.json
import { readFileSync } from 'node:fs';
import { KEYPOINT_THRESHOLD } from '../../../packages/core/src/lib/shaft/shaftPostprocess';
import type { ShaftDetection, ShaftPoint } from '../../../packages/core/src/lib/shaft/shaftPostprocess';
import type { CameraAngle } from '../../../packages/core/src/lib/cameraAngle';
import {
  buildShaftSwingSeries,
  checkShaftSeries,
  buildShaftMeasurements,
  type DetectedFrame,
  type Handedness,
  type MeasurementPhase,
} from '../../../src/lib/shaft/measure';

// ── What the Python side hands over ──────────────────────────────────────────

interface InFrame {
  /** Time within the clip, seconds. */
  t: number;
  /** Detector output in SOURCE pixels, absent when the model returned no box. */
  bx?: number;
  by?: number;
  bs?: number;
  hx?: number;
  hy?: number;
  hs?: number;
  /** MediaPipe landmarks, NORMALISED, keyed by landmark index: [x, y, visibility]. */
  lm?: Record<string, [number, number, number]>;
}

interface InSwing {
  id: string;
  clip: string;
  swingIndex: number;
  cameraAngle: CameraAngle | null;
  imageSize: { width: number; height: number };
  modelFile: string;
  frames: InFrame[];
  /** 0-based indices into `frames`, each with the label the report prints. */
  candidates: { label: string; index: number }[];
}

interface Input {
  handedness: Handedness;
  swings: InSwing[];
}

// ── Adapters ─────────────────────────────────────────────────────────────────

function point(x: number | undefined, y: number | undefined, s: number | undefined): ShaftPoint | null {
  // Production's own rule: below `KEYPOINT_THRESHOLD` the point is "not located", not
  // guessed (shaftPostprocess.ts). run_dense.py writes the raw keypoint score, so the
  // threshold has to be applied here -- with the imported constant, never a literal.
  if (x === undefined || y === undefined || s === undefined) return null;
  if (s < KEYPOINT_THRESHOLD) return null;
  return { x, y, conf: s };
}

function detection(f: InFrame, imageSize: { width: number; height: number }): ShaftDetection {
  return {
    butt: point(f.bx, f.by, f.bs),
    hosel: point(f.hx, f.hy, f.hs),
    // The shipped checkpoint is two-point; `modelKeypoints: 2` is what says so, and it is
    // what makes `plausibility.ts` flag the blade as `model-lacks-blade-keypoints`
    // instead of blaming the frame.
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

/** A sparse 33-slot landmark array; `toBodyReference` reads six of them and nothing else. */
function landmarks(f: InFrame) {
  if (!f.lm) return null;
  const out = new Array(33).fill(undefined);
  for (const [k, v] of Object.entries(f.lm)) {
    out[Number(k)] = { x: v[0], y: v[1], z: 0, visibility: v[2] };
  }
  return out as never;
}

/** `backswing` … `top` … `downswing`, with the top on exactly one frame. */
function phaseAt(i: number, top: number): MeasurementPhase {
  if (i === top) return 'top';
  return i < top ? 'backswing' : 'downswing';
}

// ── Run ──────────────────────────────────────────────────────────────────────

const input: Input = JSON.parse(readFileSync(0, 'utf8'));
const out: unknown[] = [];

for (const s of input.swings) {
  const results: unknown[] = [];
  for (const cand of s.candidates) {
    if (cand.index < 0 || cand.index >= s.frames.length) {
      results.push({ label: cand.label, index: cand.index, outside: true });
      continue;
    }
    const frames: DetectedFrame[] = s.frames.map((f, i) => ({
      tSec: f.t,
      phase: phaseAt(i, cand.index),
      // `observed` on the candidate only: an OBSERVED top is what S-30's gate asks for,
      // and the whole question is what happens when that observation is one frame off.
      phaseSource: i === cand.index ? 'observed' : 'envelope-fallback',
      detection: detection(f, s.imageSize),
      landmarks: landmarks(f),
    }));
    const checked = checkShaftSeries(
      buildShaftSwingSeries(frames, {
        clipName: s.clip,
        swingIndex: s.swingIndex,
        cameraAngle: s.cameraAngle,
        modelFile: s.modelFile,
        producedAt: '2026-09-19T00:00:00.000Z',
      }),
    );
    const m = buildShaftMeasurements(checked, { handedness: input.handedness });
    const p4 = m.shaftPositionAtP4;
    const tso = m.topShaftOrientation;
    const sabp = m.shaftAngleByPhase;
    const topBucket = sabp.value?.top ?? null;
    results.push({
      label: cand.label,
      index: cand.index,
      frameUsable: checked.quality.frames[cand.index].shaftAngle.level,
      frameReasons: checked.quality.frames[cand.index].shaftAngle.reasons,
      p4: {
        answers: p4.value !== null,
        level: p4.quality.level,
        reasons: p4.quality.reasons,
        orientationDeg: p4.value?.orientationDeg ?? null,
        buttU: p4.value?.butt.u ?? null,
        buttV: p4.value?.butt.v ?? null,
        hoselU: p4.value?.hosel.u ?? null,
        hoselV: p4.value?.hosel.v ?? null,
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
        answers: topBucket !== null,
        level: sabp.quality.level,
        reasons: sabp.quality.reasons,
        topMedianDeg: topBucket?.medianDeg ?? null,
        topLevel: topBucket?.level ?? null,
        topN: topBucket?.n ?? null,
      },
    });
  }
  out.push({ id: s.id, results });
}

process.stdout.write(JSON.stringify({ swings: out }));
