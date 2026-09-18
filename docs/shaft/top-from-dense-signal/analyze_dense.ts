// SPIKE, READ-ONLY (S-28). The S-27 reversal method, on the dense per-video-frame shaft path.
// Usage: see docs/shaft/top-from-dense-signal.md. Args: <dense-dir> <export_manifests.json>
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { angleDeg, signedAngleDifference } from '../../../src/lib/shaft/measure/angles';

const DENSE = process.argv[2];
const MANIFESTS = process.argv[3];
// Box confidence >= 0.25 is applied by run_dense.py's select_best; these are the rest of the gates.
const KP = 0.5, MINLEN = 0.01; // shaftPostprocess KEYPOINT_THRESHOLD, prelabel MIN_SHAFT_FRACTION
const BIG = 90; // steps above this have no readable sign (S-27)
const EPS_SWEEP = [0.5, 1, 2, 3, 5, 8, 12];
const EPS_MAIN = 2;

type Raw = { t: number; conf?: number; bs?: number; hs?: number; bx?: number; by?: number; hx?: number; hy?: number; len_frac?: number };
type DenseFile = { swing: string; clip: string; fps: number; env: [number, number]; frames: Raw[]; wall_s: number; detect_s: number; decode_s: number };
type ManifestFrame = { id: string; tSec: number; impactSec: number | null; slowmo?: boolean };

const ok = (r: Raw) => r.conf !== undefined && r.bs! >= KP && r.hs! >= KP && r.len_frac! >= MINLEN;
const why = (r: Raw) => (r.conf === undefined ? 'no-detection' : r.bs! < KP || r.hs! < KP ? 'keypoint-below-threshold' : 'degenerate-shaft');

const files: DenseFile[] = readdirSync(DENSE).filter((n) => n.endsWith('.json')).sort()
  .map((n) => JSON.parse(readFileSync(path.join(DENSE, n), 'utf8')));
const envFrames = new Map<string, ManifestFrame[]>();
for (const e of JSON.parse(readFileSync(MANIFESTS, 'utf8')) as { manifest: { frames: ManifestFrame[] } }[])
  for (const f of e.manifest.frames) {
    const k = f.id.replace(/_f\d+$/, '');
    if (!envFrames.has(k)) envFrames.set(k, []);
    envFrames.get(k)!.push(f);
  }
for (const v of envFrames.values()) v.sort((a, b) => a.tSec - b.tSec);

type Swing = { key: string; t: number[]; ang: (number | null)[]; steps: number[]; file: DenseFile };
const swings: Swing[] = files.map((f) => {
  const ang = f.frames.map((r) => (ok(r) ? angleDeg({ x: r.bx!, y: r.by! }, { x: r.hx!, y: r.hy! }) : null));
  const steps = ang.slice(1).map((x, i) => (x == null || ang[i] == null ? NaN : signedAngleDifference(x, ang[i]!)));
  return { key: f.swing, t: f.frames.map((r) => r.t), ang, steps, file: f };
});

// S-27's method, unchanged: a candidate is the frame where the sign of the step reverses;
// steps > BIG or across a gap break the chain, steps < eps are rest and carry the sign.
function candidates(steps: number[], eps: number): number[] {
  const out: number[] = []; let sign = 0; let lastMoveEnd = -1;
  steps.forEach((d, i) => {
    if (Number.isNaN(d) || Math.abs(d) > BIG) { sign = 0; return; }
    if (Math.abs(d) < eps) return;
    const sg = Math.sign(d);
    if (sign !== 0 && sg !== sign) out.push(lastMoveEnd);
    sign = sg; lastMoveEnd = i + 1;
  });
  return out;
}

// 1. Coverage.
const cov = swings.map((s) => s.ang.filter((a) => a != null).length / s.ang.length);
const missWhy: Record<string, number> = {};
let nFrames = 0;
for (const s of swings) for (const r of s.file.frames) { nFrames++; if (!ok(r)) missWhy[why(r)] = (missWhy[why(r)] ?? 0) + 1; }
const longestGap = swings.map((s) => { let best = 0, cur = 0; for (const a of s.ang) { cur = a == null ? cur + 1 : 0; best = Math.max(best, cur); } return best; });
// Where the gaps are: fraction of the envelope, in tenths.
const gapByDecile = Array(10).fill(0), framesByDecile = Array(10).fill(0);
for (const s of swings) {
  const [a, b] = s.file.env;
  s.t.forEach((t, i) => { const d = Math.min(9, Math.max(0, Math.floor(((t - a) / (b - a)) * 10))); framesByDecile[d]++; if (s.ang[i] == null) gapByDecile[d]++; });
}

// 2. Step distribution over readable adjacent pairs.
const buckets: [string, (x: number) => boolean][] = [['<1', (x) => x < 1], ['1–2', (x) => x >= 1 && x < 2], ['2–5', (x) => x >= 2 && x < 5], ['5–20', (x) => x >= 5 && x < 20], ['20–90', (x) => x >= 20 && x <= 90], ['>90', (x) => x > 90]];
const stepHist: Record<string, number> = {}; let nSteps = 0; let nPairs = 0;
for (const s of swings) for (const d of s.steps) { nPairs++; if (Number.isNaN(d)) continue; nSteps++; const b = buckets.find(([, f]) => f(Math.abs(d)))![0]; stepHist[b] = (stepHist[b] ?? 0) + 1; }

// 3. Sweep.
const sweep = EPS_SWEEP.map((eps) => {
  const c = swings.map((s) => candidates(s.steps, eps));
  return { eps, zero: c.filter((x) => x.length === 0).length, one: c.filter((x) => x.length === 1).length, many: c.filter((x) => x.length > 1).length, median: median(c.map((x) => x.length)) };
});
function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; }
// Movement of the chosen (first) candidate across the sweep, per swing, in video frames.
const spread = swings.map((s) => {
  const picks = EPS_SWEEP.map((eps) => candidates(s.steps, eps)[0]).filter((x) => x !== undefined) as number[];
  return { key: s.key, n: picks.length, range: picks.length ? Math.max(...picks) - Math.min(...picks) : NaN, picks };
});

// The same, over the middle of the sweep only (2–5°), where each eps still leaves most swings a pick.
const spreadMid = swings.map((s) => {
  const picks = [2, 3, 5].map((eps) => candidates(s.steps, eps)[0]);
  const got = picks.filter((x) => x !== undefined) as number[];
  return { all3: got.length === 3, range: got.length === 3 ? Math.max(...got) - Math.min(...got) : NaN };
});

// Plateau at the main-eps pick: run of consecutive readable steps under 2° that touches it.
function plateau(s: Swing, k: number) {
  let lo = k, hi = k;
  while (lo - 1 >= 0 && !Number.isNaN(s.steps[lo - 1]) && Math.abs(s.steps[lo - 1]) < 2) lo--;
  while (hi < s.steps.length && !Number.isNaN(s.steps[hi]) && Math.abs(s.steps[hi]) < 2) hi++;
  return hi - lo; // number of sub-2° steps in the run
}

// 4. Review rows.
const facit = readFileSync('docs/shaft/phase-audit/facit.md', 'utf8');
const review = readFileSync('docs/shaft/phase-audit/review.md', 'utf8');
const rev = new Map<number, string>();
for (const l of review.split('\n')) { const c = l.split('|').map((x) => x.trim()); if (/^\d+$/.test(c[1] ?? '') && c.length > 7) rev.set(+c[1], c[6]); }
const rows: string[] = [];
for (const l of facit.split('\n')) {
  const c = l.split('|').map((x) => x.trim());
  if (!(/^\d+$/.test(c[1] ?? '') && c.length > 10)) continue;
  const n = +c[1]; const id = c[2].replace(/`/g, ''); const key = id.replace(/_f\d+$/, '');
  const s = swings.find((x) => x.key === key);
  if (!s) continue;
  const env = envFrames.get(key)!; const j = env.findIndex((f) => f.id === id);
  const per = EPS_SWEEP.map((eps) => {
    const k = candidates(s.steps, eps)[0];
    if (k === undefined) return '∅';
    const tk = s.t[k];
    const nearest = env.reduce((bi, f, i) => (Math.abs(f.tSec - tk) < Math.abs(env[bi].tSec - tk) ? i : bi), 0);
    const rel = nearest - j;
    return `${(tk - env[j].tSec >= 0 ? '+' : '') + (tk - env[j].tSec).toFixed(2)}s→${rel === 0 ? '=' : rel > 0 ? '+' + rel : rel}`;
  });
  rows.push([n, id, c[5].replace(/\*/g, ''), (rev.get(n) ?? '').slice(0, 34), per.join('  ')].join(' | '));
}

const r2 = (x: number) => Math.round(x * 100) / 100;
console.log(JSON.stringify({
  swings: swings.length, frames: nFrames, missWhy,
  coverage: { median: r2(median(cov)), p10: r2([...cov].sort((a, b) => a - b)[Math.floor(cov.length * 0.1)]), full: cov.filter((x) => x === 1).length, geq90: cov.filter((x) => x >= 0.9).length },
  longestGap: { median: median(longestGap), max: Math.max(...longestGap) },
  gapShareByDecile: gapByDecile.map((g, i) => r2(g / framesByDecile[i])),
  steps: { pairs: nPairs, readable: nSteps, hist: stepHist },
  sweep,
  spread: {
    withAnyPick: spread.filter((x) => x.n > 0).length,
    pickAtAllEps: spread.filter((x) => x.n === EPS_SWEEP.length).length,
    range0: spread.filter((x) => x.n > 1 && x.range === 0).length,
    rangeLe2: spread.filter((x) => x.n > 1 && x.range <= 2).length,
    rangeGt10: spread.filter((x) => x.n > 1 && x.range > 10).length,
    medianRange: median(spread.filter((x) => x.n > 1).map((x) => x.range)),
    multiPick: spread.filter((x) => x.n > 1).length,
  },
  spreadMid: { all3: spreadMid.filter((x) => x.all3).length, range0: spreadMid.filter((x) => x.range === 0).length, rangeLe2: spreadMid.filter((x) => x.range <= 2).length, rangeGt10: spreadMid.filter((x) => x.range > 10).length, medianRange: median(spreadMid.filter((x) => x.all3).map((x) => x.range)) },
  plateauAtMain: (() => { const p = swings.map((s) => { const k = candidates(s.steps, EPS_MAIN)[0]; return k === undefined ? null : plateau(s, k); }).filter((x) => x != null) as number[]; return { n: p.length, median: median(p), geq3: p.filter((x) => x >= 3).length }; })(),
  pickPosition: (() => { const p = swings.map((s) => { const k = candidates(s.steps, EPS_MAIN)[0]; return k === undefined ? null : (s.t[k] - s.file.env[0]) / (s.file.env[1] - s.file.env[0]); }).filter((x) => x != null) as number[]; const h = Array(10).fill(0); for (const x of p) h[Math.min(9, Math.max(0, Math.floor(x * 10)))]++; return h; })(),
  timing: { wallPerFrame: r2(swings.reduce((a, s) => a + s.file.wall_s, 0) / nFrames * 1000) / 1000, detectPerFrame: r2(swings.reduce((a, s) => a + s.file.detect_s, 0) / nFrames * 1000) / 1000, medianWallPerSwing: r2(median(swings.map((s) => s.file.wall_s))), maxWallPerSwing: r2(Math.max(...swings.map((s) => s.file.wall_s))), totalMin: r2(swings.reduce((a, s) => a + s.file.wall_s, 0) / 60), medianFramesPerSwing: median(swings.map((s) => s.t.length)) },
}));
console.log('eps: ' + EPS_SWEEP.join(' '));
console.log(rows.join('\n'));
console.log('SPREAD ' + spread.map((x) => `${x.key}:${x.picks.join(',')}`).join(' '));
