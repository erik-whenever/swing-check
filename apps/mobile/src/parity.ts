// Parity: the same still through the app's MediaPipe (Android, tasks-vision 0.10.35) and through
// Python's (training/pose_parity.py, mediapipe 0.10.35), the same .task files, IMAGE mode on both
// sides (VIDEO tracking depends on history). Compares all 33 landmarks.
//
// The still and the reference are written by training/pose_parity.py into assets/parity/, which
// is gitignored (identifiable person) and served by Metro from this machine. Without them Metro
// resolves the requires to an empty module (metro.config.js) and the parity says so.
import type { PoseConfig, PoseImageResult, PoseModel, PoseProbe } from '@swingcheck/native-pose';
import { Asset } from 'expo-asset';
import { round } from './measure';

const IMAGE = require('../assets/parity/pose.png');
const REFERENCE: Partial<Reference> = require('../assets/parity/pose-reference.json');

interface Reference {
  kind: 'swingcheck-pose-parity';
  source: Record<string, unknown>;
  image: { file: string; width: number; height: number; sha256: string };
  mediapipe: string;
  models: Record<PoseModel, { sha256: string; status: string; landmarks: number[][] }>;
}

/**
 * The gate (CPU, both models): the largest |Δx| or |Δy| over all 33 landmarks, normalized.
 * 0.005 is 6.4 px across 1280 and 3.6 px across 720. It is below the narrowest margin a real
 * swing had to one of core's spatial thresholds: impact needs the wrists within
 * IMPACT_ADDRESS_TOL = 0.07 of address height, and the measured contacts lay at 0.056–0.063
 * (poseEnvelope.ts), so 0.007 from the edge. A runtime difference under 0.005 cannot move a
 * swing across that edge. Expected in practice: ~1e-4 or less, since the model, the pixels and
 * the library version are the same and only the CPU kernels (ARM vs x86) differ.
 */
export const XY_LIMIT = 0.005;
/** Visibility gates samples at MIN_VISIBILITY = 0.4 in core; 0.02 keeps a sample's side of it. */
export const VIS_LIMIT = 0.02;
/** The points core reads: shoulders, wrists, hips. */
const CORE_POINTS = [11, 12, 15, 16, 23, 24];

export interface ParityRun {
  model: PoseModel;
  requested: PoseConfig['delegate'];
  delegate: string;
  viaYuv: boolean;
  status: string;
  inferenceMs: number;
  /** Largest |Δx|, |Δy| over all 33, normalized, and in pixels of the still. */
  maxXY: number;
  maxXYPx: number;
  maxXYCore: number;
  worstIndex: number;
  maxZ: number;
  maxVisibility: number;
  /** Gate applies to the CPU runs without the YUV round trip. */
  gated: boolean;
  pass: boolean;
  landmarks: number[][];
}

export interface ParityResult {
  ok: boolean;
  message: string;
  image?: Reference['image'];
  source?: Reference['source'];
  pythonMediapipe?: string;
  limits: { xy: number; visibility: number };
  runs: ParityRun[];
}

const RUNS: { delegate: PoseConfig['delegate']; viaYuv: boolean }[] = [
  { delegate: 'cpu', viaYuv: false },
  { delegate: 'gpu', viaYuv: false },
  { delegate: 'cpu', viaYuv: true },
];

function unpack(r: PoseImageResult): number[][] {
  const f = new Float32Array(r.landmarks);
  return Array.from({ length: 33 }, (_, i) => [f[4 * i], f[4 * i + 1], f[4 * i + 2], f[4 * i + 3]]);
}

export async function runParity(probe: PoseProbe): Promise<ParityResult> {
  const limits = { xy: XY_LIMIT, visibility: VIS_LIMIT };
  if (REFERENCE.kind !== 'swingcheck-pose-parity' || REFERENCE.models == null || REFERENCE.image == null) {
    return { ok: false, message: 'paritetsbild saknas: kör training/pose_parity.py', limits, runs: [] };
  }
  const asset = Asset.fromModule(IMAGE);
  await asset.downloadAsync();
  const path = asset.localUri ?? asset.uri;
  const { width, height } = REFERENCE.image;
  const runs: ParityRun[] = [];
  for (const model of ['lite', 'full'] as const) {
    const ref = REFERENCE.models[model];
    for (const { delegate, viaYuv } of RUNS) {
      const r = probe.detectImage(path, { model, delegate }, viaYuv);
      const lms = unpack(r);
      let maxXY = 0;
      let maxXYPx = 0;
      let maxXYCore = 0;
      let worstIndex = -1;
      let maxZ = 0;
      let maxVisibility = 0;
      if (r.status === 'ok' && ref.status === 'ok') {
        lms.forEach(([x, y, z, v], i) => {
          const [rx, ry, rz, rv] = ref.landmarks[i];
          const dx = Math.abs(x - rx);
          const dy = Math.abs(y - ry);
          const d = Math.max(dx, dy);
          if (d > maxXY) {
            maxXY = d;
            worstIndex = i;
          }
          maxXYPx = Math.max(maxXYPx, dx * width, dy * height);
          if (CORE_POINTS.includes(i)) maxXYCore = Math.max(maxXYCore, d);
          maxZ = Math.max(maxZ, Math.abs(z - rz));
          maxVisibility = Math.max(maxVisibility, Math.abs(v - rv));
        });
      }
      const gated = delegate === 'cpu' && !viaYuv;
      const matched = r.status === ref.status && r.status === 'ok';
      runs.push({
        model,
        requested: delegate,
        delegate: r.delegate,
        viaYuv,
        status: r.status,
        inferenceMs: round(r.inferenceMs, 1),
        maxXY: round(maxXY, 6),
        maxXYPx: round(maxXYPx, 2),
        maxXYCore: round(maxXYCore, 6),
        worstIndex,
        maxZ: round(maxZ, 6),
        maxVisibility: round(maxVisibility, 6),
        gated,
        pass: matched && maxXY <= XY_LIMIT && maxVisibility <= VIS_LIMIT,
        landmarks: lms.map((p) => p.map((v) => round(v, 6))),
      });
    }
  }
  const gatedRuns = runs.filter((r) => r.gated);
  const ok = gatedRuns.length === 2 && gatedRuns.every((r) => r.pass);
  const worst = Math.max(...gatedRuns.map((r) => r.maxXY));
  return {
    ok,
    message: `${ok ? 'klarar' : 'KLARAR INTE'} gränsen: CPU max |Δ| ${worst.toExponential(1)} (gräns ${XY_LIMIT})`,
    image: REFERENCE.image,
    source: REFERENCE.source,
    pythonMediapipe: REFERENCE.mediapipe,
    limits,
    runs,
  };
}
