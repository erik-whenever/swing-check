/// <reference types="node" />
// S-44 verification harness — NOT a unit test. Runs the production segmenter
// (`detectSessionSwings`, src/lib/poseSegments.ts) over the warm whole-clip pose tracks
// of all own clips twice: as before S-44 (no options) and as production now calls it
// (`timeStretched` read from the real file by `readTimeStretch`). Writes one JSON row per
// clip. Skips itself unless S44_CLIPPOSE points at the run_pose_clip.py output, so
// `npm test` is unaffected.
//
//   <venv>/python.exe docs/shaft/top-review/run_pose_clip.py <out>/clippose --registry <reg>
//   S44_CLIPPOSE=<out>/clippose S44_OUT=<out>/compare.json npx vitest run docs/shaft/slowmo
import { openAsBlob, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { blobSource, probeMp4, timeStretchOf } from '../../../packages/core/src/lib/mp4Probe';
import { detectSessionSwings, type SessionSwings } from '../../../packages/core/src/lib/poseSegments';
import type { PoseSample } from '../../../src/lib/poseTrajectory';

const POSE_DIR = process.env.S44_CLIPPOSE;
const CLIPS = 'data/shaft/clips/own';

interface Row {
  t: number;
  w?: Record<string, number[]>;
  x?: Record<string, number[]>;
}

/** run_pose_clip.py keeps wrists (x,y,z,vis,pres) and shoulders/hips (x,y,vis,pres). */
function toSamples(frames: Row[]): PoseSample[] {
  return frames.map((r) => {
    if (!r.w) return { t: r.t, landmarks: [] };
    const lm: PoseSample['landmarks'] = [];
    for (const [i, [x, y, z, visibility]] of Object.entries(r.w)) lm[+i] = { x, y, z, visibility };
    for (const [i, [x, y, visibility]] of Object.entries(r.x ?? {})) lm[+i] = { x, y, z: 0, visibility };
    return { t: r.t, landmarks: lm };
  });
}

const summary = (s: SessionSwings) => ({
  swings: s.swings.length,
  swingEnv: s.swings.map((w) => [+w.envelope.startSec.toFixed(2), +w.envelope.finishSec.toFixed(2)]),
  impactSec: s.swings.map((w) => (w.impactSec === null ? null : +w.impactSec.toFixed(2))),
  rejected: s.rejected.map((r) => r.reason),
  culled: s.segmentation.diagnostics.bursts.filter((b) => !b.admitted).map((b) => b.culledBy),
  reason: s.segmentation.reason ?? null,
});

it.skipIf(!POSE_DIR)('S-44 before/after over all own clips', async () => {
  const out = [];
  for (const f of readdirSync(POSE_DIR!).sort()) {
    const j = JSON.parse(readFileSync(`${POSE_DIR}/${f}`, 'utf-8'));
    const samples = toSamples(j.frames);
    const stretch = timeStretchOf(await probeMp4(blobSource(await openAsBlob(`${CLIPS}/${j.clip}`))));
    const before = detectSessionSwings(samples);
    const after = detectSessionSwings(samples, { timeStretched: stretch.timeStretched });
    out.push({ clip: j.clip, fps: j.fps, ...stretch, before: summary(before), after: summary(after) });
  }
  writeFileSync(process.env.S44_OUT ?? 'stretch_compare.json', JSON.stringify(out, null, 1));
}, 600_000);
