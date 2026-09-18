// SPIKE, READ-ONLY (S-29). Analysis of the dropout (frames without an accepted shaft) in the dense
// tracks from S-28. NO new detection: reads the per-frame JSON that run_dense.py already wrote.
// Usage: see docs/shaft/top-from-dropout.md. Args: <dense-dir> <export_manifests.json>
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { angleDeg, signedAngleDifference } from '../../../src/lib/shaft/measure/angles';

const DENSE = process.argv[2];
const MANIFESTS = process.argv[3];
// Same gates as analyze_dense.ts (S-28): box >= 0.25 is applied by run_dense.py's select_best.
const KP = 0.5, MINLEN = 0.01, BIG = 90;
const WIN = 3; // +-3 video frames (~0.1 s): about the resolution of Erik's top, see below
const LONG = 5; // "long gap" for the control: >= 5 frames (~0.17 s), the median longest gap
const NSHUF = 5000;

type Raw = { t: number; conf?: number; bs?: number; hs?: number; bx?: number; by?: number; hx?: number; hy?: number; len_frac?: number };
type DenseFile = { swing: string; clip: string; fps: number; env: [number, number]; frames: Raw[] };
type MF = { id: string; tSec: number; impactSec: number | null };

const ok = (r: Raw) => r.conf !== undefined && r.bs! >= KP && r.hs! >= KP && r.len_frac! >= MINLEN;
const why = (r: Raw) => (r.conf === undefined ? 'no-detection' : r.bs! < KP || r.hs! < KP ? 'kp-below' : 'degenerate');

const files: DenseFile[] = readdirSync(DENSE).filter((n) => n.endsWith('.json')).sort().map((n) => JSON.parse(readFileSync(path.join(DENSE, n), 'utf8')));
const envFrames = new Map<string, MF[]>();
for (const e of JSON.parse(readFileSync(MANIFESTS, 'utf8')) as { manifest: { frames: MF[] } }[])
  for (const f of e.manifest.frames) { const k = f.id.replace(/_f\d+$/, ''); if (!envFrames.has(k)) envFrames.set(k, []); envFrames.get(k)!.push(f); }
for (const v of envFrames.values()) v.sort((a, b) => a.tSec - b.tSec);

// BRIDGE = 0: a gap is a maximal run of consecutive frames without an accepted shaft (the brief's "sammanhängande").
// BRIDGE = 1: sensitivity variant, two gaps separated by at most one accepted frame are joined (added AFTER seeing that
// a single accepted frame at 1.600 s splits row 32's dropout; run both, compare, and say so).
const BRIDGE = Number(process.env.BRIDGE ?? 0);
type Gap = { i0: number; i1: number; len: number; miss: number; tMid: number; kind: 'lead' | 'trail' | 'interior' };
type Swing = { key: string; f: DenseFile; t: number[]; good: boolean[]; ang: (number | null)[]; steps: number[]; gaps: Gap[]; frac: (t: number) => number };
const swings: Swing[] = files.map((f) => {
  const good = f.frames.map(ok);
  const ang = f.frames.map((r, i) => (good[i] ? angleDeg({ x: r.bx!, y: r.by! }, { x: r.hx!, y: r.hy! }) : null));
  const steps = ang.slice(1).map((x, i) => (x == null || ang[i] == null ? NaN : signedAngleDifference(x, ang[i]!)));
  const t = f.frames.map((r) => r.t);
  return { key: f.swing, f, t, good, ang, steps, gaps: gapsOf(good, t), frac: (x) => (x - f.env[0]) / (f.env[1] - f.env[0]) };
});
function gapsOf(good: boolean[], t: number[]): Gap[] {
  const runs: { i0: number; i1: number }[] = []; let i = 0;
  while (i < good.length) {
    if (good[i]) { i++; continue; }
    let j = i; while (j + 1 < good.length && !good[j + 1]) j++;
    runs.push({ i0: i, i1: j });
    i = j + 1;
  }
  const merged: { i0: number; i1: number }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.i0 - last.i1 - 1 <= BRIDGE) last.i1 = r.i1; else merged.push({ ...r });
  }
  return merged.map(({ i0, i1 }) => ({
    i0, i1, len: i1 - i0 + 1, miss: good.slice(i0, i1 + 1).filter((g) => !g).length, tMid: (t[i0] + t[i1]) / 2,
    kind: i0 === 0 ? 'lead' : i1 === good.length - 1 ? 'trail' : 'interior',
  } as Gap));
}
const longest = (gs: Gap[]) => gs.reduce<Gap | undefined>((b, g) => (!b || g.len > b.len ? g : b), undefined); // ties -> earliest
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const med = (xs: number[]) => q(xs, 0.5);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ---- 1. Gap census --------------------------------------------------------------------------
const nMiss = swings.map((s) => s.good.filter((g) => !g).length);
const allGaps = swings.flatMap((s) => s.gaps.map((g) => ({ ...g, key: s.key })));
const lenBuckets: [string, (n: number) => boolean][] = [['1', (n) => n === 1], ['2', (n) => n === 2], ['3–4', (n) => n >= 3 && n <= 4], ['5–9', (n) => n >= 5 && n <= 9], ['10–19', (n) => n >= 10 && n <= 19], ['≥20', (n) => n >= 20]];
const census = lenBuckets.map(([name, f]) => { const gs = allGaps.filter((g) => f(g.len)); return { len: name, gaps: gs.length, frames: gs.reduce((a, g) => a + g.miss, 0) }; });
const totalMiss = nMiss.reduce((a, b) => a + b, 0);
const gapsPerSwing = swings.map((s) => s.gaps.length);
const kindCount = { lead: 0, trail: 0, interior: 0 } as Record<string, number>;
for (const g of allGaps) kindCount[g.kind]++;
const kindFrames = { lead: 0, trail: 0, interior: 0 } as Record<string, number>;
for (const g of allGaps) kindFrames[g.kind] += g.miss;
// Position of gap midpoints (share of all missing frames, by envelope decile of the gap's frames).
const dec = (n: number, x: number) => Math.min(n - 1, Math.max(0, Math.floor(x * n)));
const missByDec = Array(10).fill(0);
for (const s of swings) s.f.frames.forEach((r, i) => { if (!s.good[i]) missByDec[dec(10, s.frac(s.t[i]))]++; });
const longMissByDec = Array(10).fill(0); // frames inside gaps >= LONG
for (const s of swings) for (const g of s.gaps) if (g.len >= LONG) for (let i = g.i0; i <= g.i1; i++) if (!s.good[i]) longMissByDec[dec(10, s.frac(s.t[i]))]++;

// ---- 2. Concentration vs a shuffle null -----------------------------------------------------
let seed = 0x5eed1234;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function shuffled(good: boolean[]) { const a = [...good]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const conc = swings.map((s, si) => {
  const m = nMiss[si]; const L = longest(s.gaps)!;
  const obsShare = L.miss / m; const obsN = s.gaps.length;
  const shares: number[] = [], ns: number[] = [];
  for (let k = 0; k < NSHUF; k++) { const g = gapsOf(shuffled(s.good), s.t); shares.push(longest(g)!.miss / m); ns.push(g.length); }
  // one-sided p: how often does a random placement give a dominance at least this high?
  const p = shares.filter((x) => x >= obsShare - 1e-12).length / NSHUF;
  return { key: s.key, m, obsShare, obsN, nullShare: med(shares), nullN: med(ns), p, others: m - L.miss, longestLen: L.len };
});
const restShort = conc.map((c, i) => { const gs = swings[i].gaps.filter((g) => g !== longest(swings[i].gaps)); return gs.length; });

// ---- 3. The 15 rows against the pointed top -------------------------------------------------
const facit = readFileSync('docs/shaft/phase-audit/facit.md', 'utf8');
const review = readFileSync('docs/shaft/phase-audit/review.md', 'utf8');
const rev = new Map<number, { txt: string; star: boolean }>();
for (const l of review.split('\n')) { const c = l.split('|').map((x) => x.trim()); if (/^\d+$/.test(c[1] ?? '') && c.length > 7) rev.set(+c[1], { txt: c[6], star: c[7] === '★' }); }
const KP_EPS = [2, 3, 5];
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
// Erik's pointed top, in the envelope frame list: the rated frame itself for `top`, the NEXT envelope
// frame for `backswing*` (the review's star: "the next image is the absolute top"). Nothing else names a frame.
type Ref = { n: number; id: string; s: Swing; env: MF[]; j: number; verdict: string; topT: number | null; topLo: number | null; prevT: number | null; nextT: number | null; side: 'at' | 'before' | 'after' | 'none' };
const refs: Ref[] = [];
for (const l of facit.split('\n')) {
  const c = l.split('|').map((x) => x.trim());
  if (!(/^\d+$/.test(c[1] ?? '') && c.length > 10)) continue;
  const n = +c[1]; const id = c[2].replace(/`/g, ''); const key = id.replace(/_f\d+$/, '');
  const s = swings.find((x) => x.key === key); if (!s) continue;
  const env = envFrames.get(key)!; const j = env.findIndex((f) => f.id === id);
  const v = rev.get(n)!; const w = v.txt.split(/[\s(]/)[0];
  let topT: number | null = null; let topLo: number | null = null; let side: Ref['side'] = 'none';
  // topLo..topT is the interval Erik's answer leaves open: a point for `top`, [rated frame, next frame] for the star.
  if (w === 'top') { topT = env[j].tSec; topLo = topT; side = 'at'; }
  else if (w.startsWith('backswing') && v.star) { topT = env[j + 1].tSec; topLo = env[j].tSec; side = 'at'; }
  else if (w === 'backswing') side = 'after'; // top is later than the frame
  else if (w === 'downswing' || w === 'finish') side = 'before'; // top is earlier than the frame
  refs.push({ n, id, s, env, j, verdict: v.txt.slice(0, 28) + (v.star ? ' ★' : ''), topT, topLo, prevT: j > 0 ? env[j - 1].tSec : null, nextT: j < env.length - 1 ? env[j + 1].tSec : null, side });
}
// Percentile of |mid - top| among uniformly random times over the envelope: share of the envelope that is
// AT LEAST as close to the mid as the top is. Small = top is unusually near the mid.
function closerShare(s: Swing, mid: number, top: number) {
  const d = Math.abs(mid - top); const [a, b] = s.f.env; const N = 2000; let c = 0;
  for (let i = 0; i < N; i++) if (Math.abs(mid - (a + ((i + 0.5) / N) * (b - a))) <= d) c++;
  return c / N;
}
const rowsOut = refs.map((r) => {
  const s = r.s; const L = longest(s.gaps)!; const Li = longest(s.gaps.filter((g) => g.kind === 'interior'));
  const fps = s.f.fps || 30;
  const inGap = (g: Gap | undefined, t: number) => !!g && t >= s.t[g.i0] - 1e-6 && t <= s.t[g.i1] + 1e-6;
  const anyGap = (t: number) => s.gaps.some((g) => inGap(g, t));
  const gapMidD = r.topT == null ? null : L.tMid - r.topT;
  const gapMidDi = r.topT == null || !Li ? null : Li.tMid - r.topT;
  const picks = KP_EPS.map((eps) => { const k = candidates(s.steps, eps)[0]; return k === undefined ? null : s.t[k] - (r.topT ?? NaN); });
  return {
    n: r.n, id: r.id, verdict: r.verdict, side: r.side, topT: r.topT, topLo: r.topLo, prevT: r.prevT, nextT: r.nextT, fps,
    env: s.f.env, nFrames: s.t.length, cov: r2(s.good.filter(Boolean).length / s.good.length), nGaps: s.gaps.length,
    L: { i0: L.i0, i1: L.i1, len: L.len, kind: L.kind, t0: r3(s.t[L.i0]), t1: r3(s.t[L.i1]), mid: r3(L.tMid), midFrac: r2(s.frac(L.tMid)) },
    Li: Li ? { len: Li.len, mid: r3(Li.tMid) } : null,
    topFrac: r.topT == null ? null : r2(s.frac(r.topT)),
    dGapMid: gapMidD == null ? null : { s: r2(gapMidD), fr: Math.round(gapMidD * fps), share: closerShare(s, L.tMid, r.topT!) },
    dGapMidInterior: gapMidDi == null ? null : { s: r2(gapMidDi), fr: Math.round(gapMidDi * fps) },
    // distance from the gap midpoint to the interval Erik's answer leaves open (0 = inside it)
    dInterval: r.topT == null ? null : (() => { const m = L.tMid; const d = m < r.topLo! ? m - r.topLo! : m > r.topT! ? m - r.topT! : 0; return { s: r2(d), fr: Math.round(d * fps) }; })(),
    edges: r.topT == null ? null : { startToTop: r2(s.t[L.i0] - r.topT), endToTop: r2(s.t[L.i1] - r.topT), startToTopFr: Math.round((s.t[L.i0] - r.topT) * fps) },
    baseLongest: r3(L.len / s.t.length), baseAny: r3(s.gaps.reduce((a, g) => a + g.len, 0) / s.t.length),
    topInLongest: r.topT == null ? null : inGap(L, r.topT), topInAnyGap: r.topT == null ? null : anyGap(r.topT),
    picks: picks.map((d) => (d == null || Number.isNaN(d) ? null : { s: r2(d), fr: Math.round(d * fps), share: r.topT == null ? null : closerShare(s, r.topT + d, r.topT) })),
    picksInterval: r.topT == null ? null : KP_EPS.map((eps) => { const k = candidates(s.steps, eps)[0]; if (k === undefined) return null; const m = s.t[k]; const d = m < r.topLo! ? m - r.topLo! : m > r.topT! ? m - r.topT! : 0; return { s: r2(d), fr: Math.round(d * fps) }; }),
    picksRaw: KP_EPS.map((eps) => { const k = candidates(s.steps, eps)[0]; return k === undefined ? null : s.t[k]; }),
    // direction rule for rows without a pointed top
    dir: r.side === 'before' ? (L.tMid <= r.env[r.j].tSec ? 'ok' : 'gap-mid AFTER frame') : r.side === 'after' ? (L.tMid >= r.env[r.j].tSec ? 'ok' : 'gap-mid BEFORE frame') : '',
    // dropout reasons in the longest gap
    reasons: (() => { const o: Record<string, number> = {}; for (let i = L.i0; i <= L.i1; i++) { const w = why(s.f.frames[i]); o[w] = (o[w] ?? 0) + 1; } return o; })(),
  };
});

// Mid vs pick, per row with a pointed top (the six).
const six = rowsOut.filter((r) => r.topT != null);

// ---- Side check: how short is the shaft around Erik's top? ---------------------------------
// len_frac exists for every frame with ANY detection (accepted or not). Window +-WIN frames around the top.
const lenCheck = six.map((r) => {
  const s = swings.find((x) => x.key === r.id.replace(/_f\d+$/, ''))!;
  const accepted = s.f.frames.filter((x) => x.len_frac !== undefined && x.bs! >= KP && x.hs! >= KP && x.len_frac >= MINLEN).map((x) => x.len_frac!);
  let idx = 0; let best = Infinity; s.t.forEach((x, i) => { if (Math.abs(x - r.topT!) < best) { best = Math.abs(x - r.topT!); idx = i; } });
  const win = s.f.frames.slice(Math.max(0, idx - WIN), Math.min(s.t.length, idx + WIN + 1));
  const withLen = win.filter((x) => x.len_frac !== undefined).map((x) => x.len_frac!);
  return { n: r.n, medianAccepted: r3(med(accepted)), window: win.length, detections: withLen.length, accepted: win.filter(ok).length, windowMedianLen: withLen.length ? r3(med(withLen)) : null, ratio: withLen.length ? r2(med(withLen) / med(accepted)) : null };
});

// ---- 5. Control: dropout at other places ----------------------------------------------------
// Local dropout ratio: missing share within +-WIN frames of a landmark / the swing's overall missing share.
function localRatio(s: Swing, si: number, t: number) {
  let idx = 0; let best = Infinity; s.t.forEach((x, i) => { if (Math.abs(x - t) < best) { best = Math.abs(x - t); idx = i; } });
  const lo = Math.max(0, idx - WIN), hi = Math.min(s.t.length - 1, idx + WIN);
  let miss = 0; for (let i = lo; i <= hi; i++) if (!s.good[i]) miss++;
  return (miss / (hi - lo + 1)) / (nMiss[si] / s.t.length);
}
const topRatios = six.map((r) => { const si = swings.findIndex((x) => x.key === r.id.replace(/_f\d+$/, '')); return r3(localRatio(swings[si], si, r.topT!)); });
const impactRatios: number[] = [], impactInLong: number[] = [], impactInAny: number[] = [], impactBase: number[] = [], impactBaseLong: number[] = [];
const finishRatios: number[] = [];
swings.forEach((s, si) => {
  const imp = envFrames.get(s.key)![0].impactSec;
  if (imp != null && imp >= s.f.env[0] && imp <= s.f.env[1]) {
    impactRatios.push(localRatio(s, si, imp));
    const inG = (g: Gap) => imp >= s.t[g.i0] - 1e-6 && imp <= s.t[g.i1] + 1e-6;
    impactInAny.push(s.gaps.some(inG) ? 1 : 0);
    impactInLong.push(s.gaps.some((g) => g.len >= LONG && inG(g)) ? 1 : 0);
    impactBase.push(s.gaps.reduce((a, g) => a + g.len, 0) / s.t.length);
    impactBaseLong.push(s.gaps.filter((g) => g.len >= LONG).reduce((a, g) => a + g.len, 0) / s.t.length);
  }
  // finish = last 10 % of the envelope's frames
  const n = s.t.length; const lo = Math.floor(n * 0.9); let miss = 0; for (let i = lo; i < n; i++) if (!s.good[i]) miss++;
  finishRatios.push((miss / (n - lo)) / (nMiss[si] / n));
});
// Where is each swing's longest gap? envelope fraction of its midpoint, by decile, and whether it touches an edge.
const longestPos = swings.map((s) => { const L = longest(s.gaps)!; return { frac: s.frac(L.tMid), kind: L.kind, len: L.len }; });
const longestHist = Array(10).fill(0); for (const x of longestPos) longestHist[dec(10, x.frac)]++;
const longLongestHist = Array(10).fill(0); for (const x of longestPos.filter((y) => y.len >= LONG)) longLongestHist[dec(10, x.frac)]++;
const longestKind = { lead: 0, trail: 0, interior: 0 } as Record<string, number>; for (const x of longestPos) longestKind[x.kind]++;
const longestLongKind = { lead: 0, trail: 0, interior: 0 } as Record<string, number>; for (const x of longestPos.filter((y) => y.len >= LONG)) longestLongKind[x.kind]++;
// Where do the six tops sit in the envelope?
const topFracs = six.map((r) => r.topFrac);
// Overall, per-swing: any gap >= LONG present anywhere? how many distinct long gaps?
const longGapsPerSwing = swings.map((s) => s.gaps.filter((g) => g.len >= LONG).length);
// Position-only control for the gap that covers Erik's top: how common is it for a swing's longest gap
// to lie in the mid-envelope at all? (share of swings with a >= LONG gap touching envelope fraction 0.25–0.6)
const covers = (s: Swing, lo: number, hi: number) => s.gaps.some((g) => g.len >= LONG && s.frac(s.t[g.i1]) >= lo && s.frac(s.t[g.i0]) <= hi);
const zoneShare = (lo: number, hi: number) => swings.filter((s) => covers(s, lo, hi)).length / swings.length;

// Exact P(>= k hits) if each of the six tops fell at a time drawn independently and uniformly over its envelope,
// with the observed gap covering a fraction p_i of that envelope's frames (Poisson-binomial).
function pAtLeast(ps: number[], k: number) {
  let dp = [1]; for (const p of ps) { const nx = Array(dp.length + 1).fill(0); dp.forEach((v, i) => { nx[i] += v * (1 - p); nx[i + 1] += v * p; }); dp = nx; }
  return dp.slice(k).reduce((a, b) => a + b, 0);
}
const hitsLongest = six.filter((r) => r.topInLongest).length, hitsAny = six.filter((r) => r.topInAnyGap).length;
const calib = { hitsLongest, expectedLongest: r2(six.reduce((a, r) => a + r.baseLongest, 0)), pLongest: r3(pAtLeast(six.map((r) => r.baseLongest), hitsLongest)),
  hitsAny, expectedAny: r2(six.reduce((a, r) => a + r.baseAny, 0)), pAny: r3(pAtLeast(six.map((r) => r.baseAny), hitsAny)) };
// Shaft length along the envelope: median over swings of (detected len_frac / the swing's accepted median), by envelope decile,
// and the share of frames with no detection at all (vs. a detection that failed a gate).
const lenByDec: number[][] = Array.from({ length: 10 }, () => []);
const noDetByDec = Array(10).fill(0), nByDec = Array(10).fill(0), failGateByDec = Array(10).fill(0);
for (const s of swings) {
  const acc = s.f.frames.filter(ok).map((x) => x.len_frac!); if (!acc.length) continue; const m = med(acc);
  s.f.frames.forEach((x, i) => { const d = dec(10, s.frac(s.t[i])); nByDec[d]++; if (x.conf === undefined) noDetByDec[d]++; else { lenByDec[d].push(x.len_frac! / m); if (!ok(x)) failGateByDec[d]++; } });
}
const lenProfile = lenByDec.map((a, d) => ({ dec: d, medianRatio: r2(med(a)), p25: r2(q(a, 0.25)), noDet: r2(noDetByDec[d] / nByDec[d]), failGate: r2(failGateByDec[d] / nByDec[d]) }));

console.log(JSON.stringify({
  n: swings.length, frames: swings.reduce((a, s) => a + s.t.length, 0), totalMiss,
  census, gapsPerSwing: { median: med(gapsPerSwing), p10: q(gapsPerSwing, 0.1), p90: q(gapsPerSwing, 0.9), max: Math.max(...gapsPerSwing), min: Math.min(...gapsPerSwing) },
  kindCount, kindFrames,
  missByDec: missByDec.map((x) => r3(x / totalMiss)), longMissByDec,
  concentration: {
    obsShareMedian: r2(med(conc.map((c) => c.obsShare))), nullShareMedian: r2(med(conc.map((c) => c.nullShare))),
    obsGapsMedian: med(conc.map((c) => c.obsN)), nullGapsMedian: med(conc.map((c) => c.nullN)),
    shareGe50: conc.filter((c) => c.obsShare >= 0.5).length, shareGe75: conc.filter((c) => c.obsShare >= 0.75).length,
    p05: conc.filter((c) => c.p <= 0.05).length, p50plus: conc.filter((c) => c.p > 0.5).length,
    restShortMedian: med(restShort), restShortP90: q(restShort, 0.9),
    longestLenMedian: med(conc.map((c) => c.longestLen)), othersMedian: med(conc.map((c) => c.others)),
    swingsWithLong: longGapsPerSwing.filter((x) => x >= 1).length, longGapsMedian: med(longGapsPerSwing), longGapsMax: Math.max(...longGapsPerSwing),
  },
  rows: rowsOut, lenCheck, calib, lenProfile,
  control: {
    topRatios, impactN: impactRatios.length, impactRatioMedian: r2(med(impactRatios)), impactRatioP10P90: [r2(q(impactRatios, 0.1)), r2(q(impactRatios, 0.9))],
    impactInAny: impactInAny.reduce((a, b) => a + b, 0), impactInAnyExpected: r2(impactBase.reduce((a, b) => a + b, 0)),
    impactInLong: impactInLong.reduce((a, b) => a + b, 0), impactInLongExpected: r2(impactBaseLong.reduce((a, b) => a + b, 0)),
    finishRatioMedian: r2(med(finishRatios)), finishRatioP10P90: [r2(q(finishRatios, 0.1)), r2(q(finishRatios, 0.9))],
    longestHist, longLongestHist, longestKind, longestLongKind, topFracs,
    zone: { '0.25-0.60': r2(zoneShare(0.25, 0.6)), '0.60-1.00': r2(zoneShare(0.6, 1)), '0-0.25': r2(zoneShare(0, 0.25)) },
  },
}, null, 1));
