// READ-ONLY — what the phase-trust rule costs, counted over all 205 swings (S-30).
//
// WHY THIS EXISTS. `topFrame` in `src/lib/shaft/measure/derived.ts` now refuses to
// anchor on a `top` nobody observed, so `shaft-position-p4`, `top-shaft-orientation` and
// the `top` bucket of `shaft-angle-by-phase` come back empty where they used to come back
// with a number. "Empty where it used to answer" is a cost, and a cost that is argued
// rather than counted is a cost nobody can check.
//
// TWO COUNTS, AND THEY ANSWER DIFFERENT QUESTIONS.
//
//   THE CENSUS (all 205 swings, `data/shaft/exports/`). Where each swing's `top` label
//   comes from, and therefore what `topFrame` does with it. Exact and detector-free: it
//   reads the phase labels and their provenance, nothing else. It is the answer to "how
//   many swings lose their top-anchored numbers", because the phase gate is the only
//   thing this change touches.
//
//   THE PRODUCTION PATH (the subset with shaft predictions in the repo). The real
//   `checkShaftSeries` → `buildShaftMeasurements`, run per swing, before and after.
//   Smaller — `prelabel.xml` covers batch-02/03 only — but it is the measurement itself
//   answering rather than a model of it.
//
// WHAT THE PRODUCTION-PATH COUNT CANNOT SHOW, AND IT IS SAID IN THE REPORT TOO:
// `prelabel.xml` carries no pose landmarks, so `shaft-position-p4` is
// `body-reference-missing` on every swing in this repo, before this change and after it.
// Its phase gate is therefore counted in the census and is NOT visible in the production
// path. Manufacturing landmarks to make the number appear would be measuring the fixture.
//
// "BEFORE" IS A RE-IMPLEMENTATION, AND IT IS MARKED AS ONE. The old selection rule — the
// last admitted frame labelled `top` — no longer exists to be called, so `beforeIndex`
// below restates those two lines. Everything else on the "before" side is the real
// measurement; only the frame choice is restated.
//
// RUN (from the repo root; needs `unzip` on PATH — git-bash ships it):
//
//   node_modules/.bin/esbuild docs/shaft/phase-trust/measure.ts --bundle \
//     --platform=node --format=esm --outfile=<tmp>/measure.mjs
//   node <tmp>/measure.mjs            # prints the counts
//   node <tmp>/measure.mjs --md       # prints them as the report's tables

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  angleDeg,
  buildShaftMeasurements,
  checkShaftSeries,
  isPhaseObserved,
  usableFrameIndices,
  MEASUREMENT_PHASES,
  type MeasurementPhase,
  type PhaseSource,
  type ShaftFrameSample,
  type ShaftSwingSeries,
} from '../../../src/lib/shaft/measure/index';
import type { CameraAngle } from '../../../src/lib/cameraAngle';

const ROOT = process.cwd();
if (!existsSync(path.join(ROOT, 'package.json'))) {
  throw new Error(`run from the repo root — ${ROOT} has no package.json`);
}
const DATA = path.join(ROOT, 'data', 'shaft');

/** The confidence floor `prelabel_batch.py` guaranteed but did not record. */
const PRELABEL_CONF_FLOOR = 0.5;

// ── Reading ──────────────────────────────────────────────────────────────────

interface ManifestFrame {
  id: string;
  clipName: string;
  swingIndex: number;
  tSec: number;
  phase: string;
  impactSec: number | null;
}

interface Prediction {
  frameId: string;
  width: number;
  height: number;
  butt: { x: number; y: number };
  hosel: { x: number; y: number };
}

function unzip(zip: string, dest: string, member?: string): void {
  mkdirSync(dest, { recursive: true });
  const args = ['-o', '-q', zip];
  if (member) args.push(member);
  args.push('-d', dest);
  execFileSync('unzip', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const frameIdOf = (file: string) => file.replace(/^.*\//, '').replace(/\.jpg$/i, '');
const swingOf = (frameId: string) => /^(.*_s\d+)_f\d+$/.exec(frameId)?.[1] ?? null;

function batchDirs(): string[] {
  const base = path.join(DATA, 'training');
  return readdirSync(base)
    .filter((n) => n.startsWith('batch-'))
    .sort()
    .map((n) => path.join(base, n));
}

/**
 * THE 205 SWINGS. `data/shaft/exports/*.zip` is the whole extracted set — 1 435 frames,
 * 7 per swing — and the same frames S-23's review, S-27's detector run and the phase
 * audit all sat on. The training batches are a 1–2 frames-per-swing SAMPLE of it, so
 * counting the cost there would count a sample and call it the set.
 */
function readExports(work: string): ManifestFrame[] {
  const dir = path.join(DATA, 'exports');
  const out: ManifestFrame[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.zip')).sort()) {
    const dest = path.join(work, 'exports', path.basename(name, '.zip'));
    unzip(path.join(dir, name), dest, 'manifest.json');
    const doc = JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
    for (const f of doc.frames as Record<string, unknown>[]) {
      out.push({
        id: String(f.id),
        clipName: String(f.clipName),
        swingIndex: Number(f.swingIndex),
        tSec: Number(f.tSec),
        phase: String(f.phase),
        impactSec: (f.impactSec as number | null) ?? null,
      });
    }
  }
  return out;
}

interface Annotated {
  phase?: string;
  view?: string;
  export: string;
}

/**
 * Human annotations, under the TWO reliability rules S-24 had to introduce — restated
 * here rather than imported, because `docs/shaft/phase-audit/select.ts` is a one-off that
 * asserts against a round that is now closed.
 *
 *   1. An export whose `phase` holds the SAME value on every frame carries no phase.
 *      `batch-03/annotated-v1.zip` is `address` on all 242 — CVAT's untouched
 *      `default_value`, an unset field wearing a value.
 *   2. A frame annotated in two passes needs the passes to AGREE. batch-01 v1/v2 differ
 *      on 10 of 146 frames and the two calibration annotators on more; a frame where two
 *      people saw different phases is not an observation of either.
 *
 * Both rules only ever REMOVE observations. That direction is deliberate: this count is
 * of what the new rule still lets through, and a lenient reading of "observed" would
 * flatter it.
 */
function readAnnotations(work: string): Map<string, Annotated[]> {
  const exports: string[] = [];
  const calib = path.join(DATA, 'calibration');
  if (existsSync(calib)) {
    for (const n of readdirSync(calib).sort()) {
      if (n.endsWith('.zip') && n !== 'calibration.zip') exports.push(path.join(calib, n));
    }
  }
  for (const dir of batchDirs()) {
    for (const n of readdirSync(dir).sort()) {
      if (/^annotated.*\.zip$/.test(n)) exports.push(path.join(dir, n));
    }
  }

  const perFrame = new Map<string, Annotated[]>();
  for (const zip of exports) {
    const rel = path.relative(ROOT, zip).replace(/\\/g, '/');
    const dest = path.join(work, 'ann', rel.replace(/[\\/]/g, '-'));
    unzip(zip, dest);
    const fromThisExport: Annotated[] = [];
    for (const jsonPath of walk(dest).filter((p) => p.endsWith('.json'))) {
      const doc = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const images = new Map<number, string>(
        (doc.images ?? []).map((i: Record<string, unknown>) => [
          i.id as number,
          String(i.file_name),
        ]),
      );
      for (const ann of doc.annotations ?? []) {
        const file = images.get(ann.image_id);
        if (!file) continue;
        const attrs = (ann.attributes ?? {}) as Record<string, unknown>;
        const entry: Annotated = {
          phase: attrs.phase ? String(attrs.phase) : undefined,
          view: attrs.view ? String(attrs.view) : undefined,
          export: rel,
        };
        const id = frameIdOf(file);
        const list = perFrame.get(id) ?? [];
        list.push(entry);
        perFrame.set(id, list);
        fromThisExport.push(entry);
      }
    }
    // Rule 1.
    const phases = new Set(fromThisExport.map((e) => e.phase).filter(Boolean));
    if (phases.size === 1 && fromThisExport.length > 1) {
      for (const e of fromThisExport) e.phase = undefined;
    }
  }
  return perFrame;
}

/** Rule 2 — the phase two passes agreed on, or null. */
function observedPhase(list: Annotated[] | undefined): MeasurementPhase | null {
  const set = new Set((list ?? []).map((a) => a.phase).filter(Boolean));
  if (set.size !== 1) return null;
  const value = [...set][0]!;
  return (MEASUREMENT_PHASES as readonly string[]).includes(value)
    ? (value as MeasurementPhase)
    : null;
}

/** `prelabel.xml` → `butt`/`hosel`. `toe`/`heel` are drawn, not predicted; dropped. */
function readPrelabel(): Map<string, Prediction> {
  const out = new Map<string, Prediction>();
  for (const dir of batchDirs()) {
    const file = path.join(dir, 'prelabel.xml');
    if (!existsSync(file)) continue;
    const xml = readFileSync(file, 'utf8');
    for (const image of xml.matchAll(/<image\b([^>]*?)(?:\/>|>([\s\S]*?)<\/image>)/g)) {
      const attrs = image[1];
      const body = image[2] ?? '';
      if (!body.includes('<skeleton')) continue;
      const name = /name="([^"]+)"/.exec(attrs)?.[1];
      const width = Number(/width="(\d+)"/.exec(attrs)?.[1]);
      const height = Number(/height="(\d+)"/.exec(attrs)?.[1]);
      if (!name || !Number.isFinite(width) || !Number.isFinite(height)) continue;
      const point = (label: string) => {
        const m = new RegExp(
          `<points label="${label}"[^>]*points="([-\\d.]+),([-\\d.]+)"`,
        ).exec(body);
        return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
      };
      const butt = point('butt');
      const hosel = point('hosel');
      if (!butt || !hosel) continue;
      out.set(frameIdOf(name), { frameId: frameIdOf(name), width, height, butt, hosel });
    }
  }
  return out;
}

/** `prelabel_batch.py` → `view_bucket()`, value for value. */
function viewBucket(views: Set<string> | undefined): 'dtl' | 'face_on' | 'other' | 'unknown' {
  if (!views || views.size === 0) return 'unknown';
  const all = [...views];
  if (all.every((v) => v === 'dtl')) return 'dtl';
  if (all.every((v) => v === 'dtl' || v === 'face_on')) return 'face_on';
  return 'other';
}

// ── The census ───────────────────────────────────────────────────────────────

interface Frame {
  manifest: ManifestFrame;
  phase: MeasurementPhase;
  source: PhaseSource;
}

/** What `topFrame` does with one swing's labels. */
type Verdict =
  /** No frame carries `top` at all — `phase-missing`, before this change and after. */
  | 'phase-missing'
  /** A `top` exists and was observed — the measurements still answer. */
  | 'observed'
  /** `top` only from the impact-anchored derivation — now `top-phase-not-observed`. */
  | 'envelope-impact'
  /** `top` only from `FALLBACK_BOUNDS` — now `top-phase-not-observed`. */
  | 'envelope-fallback';

interface SwingCensus {
  key: string;
  verdict: Verdict;
  view: string;
  /** Whether the frame the OLD rule would have picked differs from the new one. */
  movedFrame: boolean;
}

function census(
  frames: ManifestFrame[],
  annotations: Map<string, Annotated[]>,
  views: Map<string, Set<string>>,
): SwingCensus[] {
  const bySwing = new Map<string, ManifestFrame[]>();
  for (const f of frames) {
    const key = swingOf(f.id);
    if (!key) continue;
    const list = bySwing.get(key) ?? [];
    list.push(f);
    bySwing.set(key, list);
  }

  const out: SwingCensus[] = [];
  for (const [key, list] of [...bySwing].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.tSec - b.tSec);
    const merged: Frame[] = list.map((m) => {
      const seen = observedPhase(annotations.get(m.id));
      if (seen) return { manifest: m, phase: seen, source: 'observed' };
      return {
        manifest: m,
        phase: m.phase as MeasurementPhase,
        source: m.impactSec !== null ? 'envelope-impact' : 'envelope-fallback',
      };
    });

    const tops = merged.filter((f) => f.phase === 'top');
    const view = viewBucket(views.get(key));
    if (tops.length === 0) {
      out.push({ key, verdict: 'phase-missing', view, movedFrame: false });
      continue;
    }
    const observed = tops.filter((f) => isPhaseObserved(f.source));
    if (observed.length === 0) {
      // Both derived sources can label the same swing when a batch frame was annotated
      // to something OTHER than top; the swing is named by the source of the frame the
      // old rule would have picked — the last one.
      out.push({ key, verdict: tops[tops.length - 1].source, view, movedFrame: false });
      continue;
    }
    out.push({
      key,
      verdict: 'observed',
      view,
      // The old rule took the last `top`; the new one takes the last OBSERVED `top`.
      // When a derived `top` sits after the observed one, the reading moves earlier.
      movedFrame: observed[observed.length - 1] !== tops[tops.length - 1],
    });
  }
  return out;
}

// ── The production path ──────────────────────────────────────────────────────

interface PathRow {
  key: string;
  /** Which frame the OLD rule picked (re-implemented), or null. */
  before: number | null;
  p4Before: 'number' | 'rejected';
  p4After: 'number' | 'rejected';
  p4AfterReasons: string[];
  topBefore: 'number' | 'cannot-determine' | 'rejected';
  topAfter: 'number' | 'cannot-determine' | 'rejected';
  topAfterReasons: string[];
  bucketBefore: boolean;
  bucketAfter: boolean;
}

function toSeries(
  key: string,
  frames: Frame[],
  preds: Map<string, Prediction>,
  cameraAngle: CameraAngle | null,
): ShaftSwingSeries | null {
  const usable = frames.filter((f) => preds.has(f.manifest.id));
  if (usable.length === 0) return null;
  const first = preds.get(usable[0].manifest.id)!;
  const samples: ShaftFrameSample[] = usable.map((f) => {
    const p = preds.get(f.manifest.id)!;
    return {
      tSec: f.manifest.tSec,
      phase: f.phase,
      phaseSource: f.source,
      butt: { ...p.butt, conf: PRELABEL_CONF_FLOOR },
      hosel: { ...p.hosel, conf: PRELABEL_CONF_FLOOR },
      toe: null,
      heel: null,
      shaftAngleDeg: angleDeg(p.butt, p.hosel),
      bladeAngleDeg: null,
      // `prelabel.xml` carries no pose. Null, never an empty reference: "no pose was
      // detected" and "a pose with no visible landmarks" are different facts.
      body: null,
    };
  });
  return {
    clipName: usable[0].manifest.clipName,
    swingIndex: usable[0].manifest.swingIndex,
    cameraAngle,
    imageSize: { width: first.width, height: first.height },
    model: { file: 'public/models/shaft-v2.onnx', keypoints: 2, provider: 'prelabel_batch.py' },
    frames: samples,
    producedAt: new Date(0).toISOString(),
    appVersion: `phase-trust/${key}`,
  };
}

function runPath(
  frames: ManifestFrame[],
  annotations: Map<string, Annotated[]>,
  views: Map<string, Set<string>>,
  preds: Map<string, Prediction>,
): PathRow[] {
  const bySwing = new Map<string, ManifestFrame[]>();
  for (const f of frames) {
    const key = swingOf(f.id);
    if (!key || !preds.has(f.id)) continue;
    const list = bySwing.get(key) ?? [];
    list.push(f);
    bySwing.set(key, list);
  }

  const rows: PathRow[] = [];
  for (const [key, list] of [...bySwing].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.tSec - b.tSec);
    const merged: Frame[] = list.map((m) => {
      const seen = observedPhase(annotations.get(m.id));
      if (seen) return { manifest: m, phase: seen, source: 'observed' };
      return {
        manifest: m,
        phase: m.phase as MeasurementPhase,
        source: m.impactSec !== null ? 'envelope-impact' : 'envelope-fallback',
      };
    });
    const bucket = viewBucket(views.get(key));
    const series = toSeries(key, merged, preds, bucket === 'dtl' ? 'dtl' : null);
    if (!series) continue;

    const checked = checkShaftSeries(series);
    const after = buildShaftMeasurements(checked, { handedness: 'right' });

    // THE OLD RULE, RESTATED. `topFrameIndex` before this change: the last admitted frame
    // labelled `top`, with no regard for where the label came from.
    const admitted = usableFrameIndices(checked, 'shaft').filter(
      (i) => series.frames[i].phase === 'top',
    );
    const before = admitted.length === 0 ? null : admitted[admitted.length - 1];

    // Everything except the frame choice is the real measurement. Running it again with
    // every `top` marked `observed` reproduces exactly what the old code returned for
    // that choice — the gate is the only thing between the two.
    const asObserved = {
      ...series,
      frames: series.frames.map((f) =>
        f.phase === 'top' ? { ...f, phaseSource: 'observed' as PhaseSource } : f,
      ),
    };
    const beforeSet = buildShaftMeasurements(checkShaftSeries(asObserved), {
      handedness: 'right',
    });

    const topState = (m: (typeof after)['topShaftOrientation']) =>
      m.value === null
        ? ('rejected' as const)
        : m.value.category === 'cannot-determine'
          ? ('cannot-determine' as const)
          : ('number' as const);

    rows.push({
      key,
      before,
      p4Before: beforeSet.shaftPositionAtP4.value ? 'number' : 'rejected',
      p4After: after.shaftPositionAtP4.value ? 'number' : 'rejected',
      p4AfterReasons: after.shaftPositionAtP4.quality.reasons,
      topBefore: topState(beforeSet.topShaftOrientation),
      topAfter: topState(after.topShaftOrientation),
      topAfterReasons: after.topShaftOrientation.quality.reasons,
      bucketBefore: beforeSet.shaftAngleByPhase.value?.top !== undefined,
      bucketAfter: after.shaftAngleByPhase.value?.top !== undefined,
    });
  }
  return rows;
}

// ── Output ───────────────────────────────────────────────────────────────────

function main(): void {
  const work = mkdtempSync(path.join(tmpdir(), 'phase-trust-'));
  try {
    const frames = readExports(work);
    const annotations = readAnnotations(work);
    const preds = readPrelabel();

    const views = new Map<string, Set<string>>();
    for (const [frameId, list] of annotations) {
      const key = swingOf(frameId);
      if (!key) continue;
      const set = views.get(key) ?? new Set<string>();
      for (const a of list) if (a.view) set.add(a.view);
      views.set(key, set);
    }

    const rows = census(frames, annotations, views);
    const path_ = runPath(frames, annotations, views, preds);
    const md = process.argv.includes('--md');
    const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
    const pct = (k: number) => `${((100 * k) / rows.length).toFixed(0)} %`;

    const lines: string[] = [];
    const say = (s = '') => lines.push(s);

    say(`Svingar i data/shaft/exports/: ${rows.length}   (bildrutor: ${frames.length})`);
    say();
    if (md) say('| Svingens `top` | Svingar | Andel | Utfall efter ändringen |\n|---|---:|---:|---|');
    const table: [string, Verdict, string][] = [
      ['observerad (annotatören såg den)', 'observed', 'svarar fortfarande'],
      ['härledd ur envelopen med nedslag', 'envelope-impact', '`top-phase-not-observed`'],
      ['härledd ur `FALLBACK_BOUNDS`', 'envelope-fallback', '`top-phase-not-observed`'],
      ['ingen bildruta bär `top`', 'phase-missing', '`phase-missing` (oförändrat)'],
    ];
    for (const [label, verdict, outcome] of table) {
      say(
        md
          ? `| ${label} | **${n(verdict)}** | ${pct(n(verdict))} | ${outcome} |`
          : `${label.padEnd(36)} ${String(n(verdict)).padStart(4)}  ${pct(n(verdict)).padStart(5)}  ${outcome}`,
      );
    }
    const lost = n('envelope-impact') + n('envelope-fallback');
    say();
    say(
      `Nya cannot_determine: ${lost} av ${rows.length} (${pct(lost)}). ` +
        `Svarar fortfarande: ${n('observed')} (${pct(n('observed'))}). ` +
        `Redan tysta: ${n('phase-missing')}.`,
    );
    say(
      `Av de ${n('observed')} som svarar byter ${rows.filter((r) => r.movedFrame).length} ` +
        'bildruta: en härledd `top` låg efter den observerade, och läsningen flyttar dit ögat var.',
    );
    say();
    say('Per vy (census):');
    for (const v of ['dtl', 'face_on', 'other', 'unknown']) {
      const inView = rows.filter((r) => r.view === v);
      if (inView.length === 0) continue;
      const obs = inView.filter((r) => r.verdict === 'observed').length;
      const gone = inView.filter(
        (r) => r.verdict === 'envelope-impact' || r.verdict === 'envelope-fallback',
      ).length;
      say(`  ${v.padEnd(8)} ${String(inView.length).padStart(4)} svingar — ${obs} svarar, ${gone} nya cannot_determine`);
    }

    say();
    say(`Produktionsvägen, körd på ${path_.length} svingar med skaftpredictions i repot:`);
    const count = (f: (r: PathRow) => boolean) => path_.filter(f).length;
    say(`  top-shaft-orientation  före: ${count((r) => r.topBefore === 'number')} tal, ` +
      `${count((r) => r.topBefore === 'cannot-determine')} cannot-determine, ` +
      `${count((r) => r.topBefore === 'rejected')} tomma`);
    say(`                         efter: ${count((r) => r.topAfter === 'number')} tal, ` +
      `${count((r) => r.topAfter === 'cannot-determine')} cannot-determine, ` +
      `${count((r) => r.topAfter === 'rejected')} tomma ` +
      `(varav ${count((r) => r.topAfterReasons.includes('top-phase-not-observed'))} på fasen)`);
    say(`  shaft-position-p4      före: ${count((r) => r.p4Before === 'number')} tal · ` +
      `efter: ${count((r) => r.p4After === 'number')} tal ` +
      `(varav ${count((r) => r.p4AfterReasons.includes('top-phase-not-observed'))} nu stoppade på fasen, ` +
      `${count((r) => r.p4AfterReasons.includes('body-reference-missing'))} på kroppen)`);
    say(`  shaft-angle-by-phase   \`top\`-hink före: ${count((r) => r.bucketBefore)} · ` +
      `efter: ${count((r) => r.bucketAfter)}`);

    console.log(lines.join('\n'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
