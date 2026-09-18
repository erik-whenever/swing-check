// SPIKE, READ-ONLY (S-27). Top as the reversal of the shaft's angular path, from detector output.
// Usage: see docs/shaft/top-from-signal.md. Args: <outdir-from-run_detector> [eps=5] [big=90] [strict|relax]
import { readFileSync, mkdtempSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { angleDeg, signedAngleDifference } from '../../../src/lib/shaft/measure/angles';

const S = process.argv[2];
const EPS = Number(process.argv[3] ?? 5);
const MIN_FRAMES = 5;
const BIG = Number(process.argv[4] ?? 90);
const RELAX = process.argv[5] === 'relax';
// Box confidence >= 0.25 (CONF_THRESHOLD) is already applied by run_detector.py's select_best.
const KP = 0.5, MINLEN = 0.01; // shaftPostprocess KEYPOINT_THRESHOLD, prelabel MIN_SHAFT_FRACTION

type ManifestFrame = { id: string; tSec: number; impactSec: number | null };
type Det = { export: string; id: string; w: number; h: number; conf?: number; bs?: number; hs?: number; bx?: number; by?: number; hx?: number; hy?: number; len_frac?: number };
const dets: Det[] = JSON.parse(readFileSync(path.join(S, 'out/detections.json'), 'utf8'));
const metas: { manifest: { frames: ManifestFrame[] } }[] = JSON.parse(readFileSync(path.join(S, 'out/export_manifests.json'), 'utf8'));
const man = new Map<string, ManifestFrame>();
for (const m of metas) for (const f of m.manifest.frames) man.set(f.id, f);
const swingOf = (id: string) => id.replace(/_f\d+$/, '');

// Views, as across-sign-candidates.ts: union of annotated views per swing.
const work = mkdtempSync(path.join(tmpdir(), 'tfs-'));
const views = new Map<string, Set<string>>();
const zips: string[] = [];
const calib = 'data/shaft/calibration';
if (existsSync(calib)) for (const n of readdirSync(calib)) if (n.endsWith('.zip') && n !== 'calibration.zip') zips.push(path.join(calib, n));
for (const b of readdirSync('data/shaft/training').filter((n) => n.startsWith('batch-')))
  for (const n of readdirSync(path.join('data/shaft/training', b))) if (/^annotated.*\.zip$/.test(n)) zips.push(path.join('data/shaft/training', b, n));
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const z of zips) {
  const dest = path.join(work, path.basename(path.dirname(z)) + path.basename(z));
  mkdirSync(dest, { recursive: true });
  execFileSync('unzip', ['-o', '-q', z, '-d', dest]);
  for (const j of walk(dest).filter((p) => p.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(j, 'utf8'));
    const imgs = new Map<number, string>((doc.images ?? []).map((i: { id: number; file_name: string }) => [i.id, String(i.file_name)]));
    for (const a of doc.annotations ?? []) {
      const f = imgs.get(a.image_id); const v = a.attributes?.view;
      if (!f || !v) continue;
      const sw = swingOf(f.replace(/^.*\//, '').replace(/\.jpg$/i, ''));
      if (!views.has(sw)) views.set(sw, new Set());
      views.get(sw)!.add(String(v));
    }
  }
}
const bucket = (sw: string) => { const v = views.get(sw); if (!v || !v.size) return 'unknown'; const a = [...v]; if (a.every((x) => x === 'dtl')) return 'dtl'; if (a.every((x) => x === 'dtl' || x === 'face_on')) return 'face_on'; return 'other'; };

function reason(d: Det): string | null {
  if (d.conf === undefined) return 'no-detection';
  if (d.bs! < KP || d.hs! < KP) return 'keypoint-below-threshold';
  if (d.len_frac! < MINLEN) return 'degenerate-shaft';
  return null;
}

type Fr = { id: string; t: number; ang: number | null; why: string | null };
type Swing = { key: string; frames: Fr[]; impact: boolean; view: string };
const swings = new Map<string, Swing>();
for (const d of dets) {
  const m = man.get(d.id)!; const key = swingOf(d.id);
  if (!swings.has(key)) swings.set(key, { key, frames: [], impact: m.impactSec != null, view: bucket(key) });
  const why = reason(d);
  swings.get(key)!.frames.push({ id: d.id, t: m.tSec, ang: why ? null : angleDeg({ x: d.bx!, y: d.by! }, { x: d.hx!, y: d.hy! }), why });
}
for (const s of swings.values()) s.frames.sort((a, b) => a.t - b.t);

// 1. Coherent path: >= MIN_FRAMES frames, every one with an admitted detection.
const drop = new Map<string, number>(); const coherent: Swing[] = [];
const dropOf = new Map<string, string>();
for (const s of swings.values()) {
  let r: string | null = null;
  const bad = s.frames.filter((f) => f.why).length;
  if (s.frames.length < MIN_FRAMES) r = `färre än ${MIN_FRAMES} bildrutor i envelopen`;
  else if (bad && !RELAX) r = bad === 1 ? 'lucka: 1 bildruta utan godkänd detektion' : `lucka: ≥2 bildrutor utan godkänd detektion`;
  if (r) { drop.set(r, (drop.get(r) ?? 0) + 1); dropOf.set(s.key, r); } else coherent.push(s);
}
const missWhy = new Map<string, number>();
for (const s of swings.values()) for (const f of s.frames) if (f.why) missWhy.set(f.why, (missWhy.get(f.why) ?? 0) + 1);
const gapPos = new Map<string, number>();
for (const s of swings.values()) if (s.frames.length >= MIN_FRAMES) s.frames.forEach((f, i) => { if (f.why) { const k = i === 0 ? 'första' : i === s.frames.length - 1 ? 'sista' : 'inre'; gapPos.set(k, (gapPos.get(k) ?? 0) + 1); } });

// 2. Candidates: reversals of the step sign; steps under EPS are rest and carry the sign.
type Res = { cands: number[]; steps: number[]; big: number };
function tops(s: Swing): Res {
  const a = s.frames.map((f) => f.ang);
  const steps = a.slice(1).map((x, i) => (x == null || a[i] == null ? NaN : signedAngleDifference(x, a[i]!)));
  const cands: number[] = []; let sign = 0; let lastMoveEnd = -1;
  steps.forEach((d, i) => {
    if (Number.isNaN(d) || Math.abs(d) > BIG) { sign = 0; return; } // unreadable sign: chain breaks
    if (Math.abs(d) < EPS) return;
    const sg = Math.sign(d);
    if (sign !== 0 && sg !== sign) cands.push(lastMoveEnd);
    sign = sg; lastMoveEnd = i + 1;
  });
  return { cands, steps, big: steps.filter((d) => Math.abs(d) > 90).length };
}
const res = new Map<string, Res>();
for (const s of coherent) res.set(s.key, tops(s));
const count = (pred: (r: Res, s: Swing) => boolean, set = coherent) => set.filter((s) => pred(res.get(s.key)!, s)).length;

// 3/4. Review rows.
const facit = readFileSync('docs/shaft/phase-audit/facit.md', 'utf8');
const review = readFileSync('docs/shaft/phase-audit/review.md', 'utf8');
const fac = new Map<number, { id: string; fas: string; kind: string; impact: boolean; frac: string }>();
for (const l of facit.split('\n')) { const c = l.split('|').map((x) => x.trim()); if (/^\d+$/.test(c[1] ?? '') && c.length > 10) fac.set(+c[1], { id: c[2].replace(/`/g, ''), fas: c[3].replace(/`/g, ''), kind: c[5].replace(/\*/g, ''), impact: !c[7].includes('nej'), frac: c[6] }); }
const rev = new Map<number, string>();
for (const l of review.split('\n')) { const c = l.split('|').map((x) => x.trim()); if (/^\d+$/.test(c[1] ?? '') && c.length > 7) rev.set(+c[1], c[6]); }

const rows: string[] = [];
for (const [n, f] of [...fac].sort((a, b) => a[0] - b[0])) {
  const key = swingOf(f.id); const s = swings.get(key)!; const erik = rev.get(n)!;
  const j = s.frames.findIndex((x) => x.id === f.id);
  const angs = s.frames.map((x) => (x.ang == null ? '—' : x.ang.toFixed(0))).join(' ');
  let pick: string, rel = '', cands = '', steps = '';
  if (dropOf.has(key)) pick = `bortfall (${dropOf.get(key)})`;
  else {
    const r = res.get(key)!; cands = r.cands.map((c) => 'f' + s.frames[c].id.slice(-2)).join(',') || '∅';
    steps = r.steps.map((d) => (Number.isNaN(d) ? '·' : d.toFixed(0))).join(' ');
    if (r.cands.length === 0) pick = 'noll';
    else { const k = r.cands[0]; rel = k === j ? '=' : k > j ? `+${k - j}` : `${k - j}`; pick = `f${s.frames[k].id.slice(-2)}${r.cands.length > 1 ? ' (flera)' : ''}`; }
  }
  rows.push([n, f.id, f.kind, f.fas, f.impact ? 'ja' : 'nej', f.frac, `${j}/${s.frames.length}`, s.view, erik.replace(/\|/g, '/').slice(0, 30), angs, steps, cands, pick, rel].join(' | '));
}

const all = [...swings.values()];
const out = {
  eps: EPS, frames: dets.length, swings: all.length, coherent: coherent.length, drop: [...drop], missWhy: [...missWhy], gapPos: [...gapPos],
  framesPerSwing: Object.entries(all.reduce((h: Record<string, number>, s) => { h[s.frames.length] = (h[s.frames.length] ?? 0) + 1; return h; }, {})),
  byView: ['dtl', 'face_on', 'other', 'unknown'].map((v) => [v, all.filter((s) => s.view === v).length, coherent.filter((s) => s.view === v).length]),
  byImpact: [true, false].map((b) => [b, all.filter((s) => s.impact === b).length, coherent.filter((s) => s.impact === b).length]),
  nCands: [0, 1, 2, 3].map((k) => [k, count((r) => (k < 3 ? r.cands.length === k : r.cands.length >= 3))]),
  nCandsDtl: [0, 1, 2, 3].map((k) => [k, count((r) => (k < 3 ? r.cands.length === k : r.cands.length >= 3), coherent.filter((s) => s.view === 'dtl'))]),
  nCandsImpact: [true, false].map((b) => [b, [0, 1, 2, 3].map((k) => count((r) => (k < 3 ? r.cands.length === k : r.cands.length >= 3), coherent.filter((s) => s.impact === b)))]),
  bigStepSwings: count((r) => r.big > 0),
  firstIdx: Object.entries(coherent.reduce((h: Record<string, number>, s) => { const r = res.get(s.key)!; if (r.cands.length) { const k = `${r.cands[0]}/${s.frames.length}`; h[k] = (h[k] ?? 0) + 1; } return h; }, {})),
};
console.log(JSON.stringify({ ...out, big: BIG, relax: RELAX }));
console.log(rows.join('\n'));
