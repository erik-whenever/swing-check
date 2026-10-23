// Parity: the same still through the app's TFLite runtime as through Python
// (training/export_tflite.py → assets/parity/reference.json), deviation per keypoint in px.
//
// The still is raw, already-letterboxed RGB, served by Metro from this machine — it never
// enters git or the EAS upload (identifiable person). Decoding goes through the SAME core
// code the web app uses (selectBest), so the only thing under test is the model runtime.

import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { TensorflowModel } from 'react-native-fast-tflite';
import { selectBest } from '@swingcheck/core/lib/shaft/shaftPostprocess';
import { round, spread, type Spread } from './stats';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const reference = require('../assets/parity/reference.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FRAME = require('../assets/parity/frame960.rgb');

const SIZE = 960;
const ANCHORS = 18900;
const KEYPOINTS = ['butt', 'hosel', 'toe', 'heel'] as const;
const TIMED_RUNS = 20;

export interface ParityResult {
  delegate: string;
  boxConf: { app: number; python: number } | null;
  /** Per keypoint: Euclidean distance app ↔ ONNX reference. */
  deviation: Record<string, { modelPx: number; sourcePx: number }>;
  maxSourcePx: number | null;
  /** Still-image inference, ms, after one warm-up run. */
  inferMs: Spread | null;
}

let input: Float32Array | null = null;

async function loadInput(): Promise<Float32Array> {
  if (input) return input;
  const asset = Asset.fromModule(FRAME);
  await asset.downloadAsync();
  const bytes = new File(asset.localUri ?? asset.uri).bytesSync();
  if (bytes.length !== SIZE * SIZE * 3) {
    throw new Error(`frame960.rgb is ${bytes.length} bytes, expected ${SIZE * SIZE * 3}`);
  }
  const f = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) f[i] = bytes[i] / 255;
  input = f;
  return f;
}

export async function runParity(model: TensorflowModel): Promise<ParityResult> {
  const x = await loadInput();
  await model.run([x]); // warm-up: Core ML compiles its plan on the first call
  // OSÄKER: Core ML-delegaten tar bara de op:ar den stöder; resten faller tillbaka till CPU i
  // samma graf. Då blir tiden en blandning — jämför med "cpu"-knappen för att se om den hjälper.

  const times: number[] = [];
  let out: Float32Array | null = null;
  for (let i = 0; i < TIMED_RUNS; i++) {
    const t0 = performance.now();
    const res = await model.run([x]);
    times.push(performance.now() - t0);
    out = res[0] as Float32Array;
  }

  const { best } = selectBest(out!, ANCHORS);
  const ref = reference.onnx.points;
  const scale: number = reference.letterbox.scale;
  const deviation: ParityResult['deviation'] = {};
  if (best) {
    for (const name of KEYPOINTS.slice(0, reference.keypoints)) {
      const a = best[name];
      const b = ref[name];
      if (!a || !b) continue;
      const modelPx = Math.hypot(a.x - b.modelX, a.y - b.modelY);
      deviation[name] = { modelPx: round(modelPx, 3), sourcePx: round(modelPx / scale, 3) };
    }
  }
  const devs = Object.values(deviation).map((d) => d.sourcePx);
  return {
    delegate: model.delegate,
    boxConf: best ? { app: round(best.conf, 4), python: round(ref.boxConf, 4) } : null,
    deviation,
    maxSourcePx: devs.length ? Math.max(...devs) : null,
    inferMs: spread(times),
  };
}
