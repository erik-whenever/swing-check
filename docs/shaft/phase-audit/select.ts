// ONE-OFF, READ-ONLY — the blind review package for the phase `top`.
//
// CLOSED ROUND — THIS NO LONGER RUNS, BY DESIGN (S-30, 2026-09-18). The assertion below
// says the three sets must still be the report's, and after S-30 they are not: the
// production path refuses to anchor on a `top` nobody observed, so it now picks NONE of
// the 22 frames this round was built from and the run stops with
// `productionPath: väntat 22, fick 0`. That is the assertion doing its job on a round
// that is finished — the package and its results stand as they were reviewed. See
// docs/shaft/phase-trust.md.
//
// WHY THIS EXISTS. `topFrameIndex` in `src/lib/shaft/measure/derived.ts` reads
// `frame.phase === 'top'` and cannot see where that label came from. When the manifest
// carries no confident impact, `derivePhase` falls back to `FALLBACK_BOUNDS` in
// `src/lib/dataset/datasetPhase.ts`, and everything in the window 0.45–0.52 of the swing
// envelope is named `top` — a PROPORTION, not an observation. One case is proved wrong:
// `img-3641-adde195e_s00_f02` bears `top` from the manifest and shows a finish
// (docs/shaft/across-sign-result.md → §4).
//
// How many more are wrong is unknown, and it cannot be settled by more arithmetic on the
// same labels: it needs an eye on the frames. This tool builds the round that makes that
// measurable — the frames production actually computes on, mixed with controls whose phase
// a human already annotated, shuffled under a fixed seed so the answer cannot be read off
// the order.
//
// IT BUILDS NO FIX AND CHANGES NOTHING. No production file is written; `derived.ts` and
// `plausibility.ts` are untouched, and the series go through `checkShaftSeries` →
// `buildShaftMeasurements` exactly as the app does. The only outputs are the three markdown
// files and the JPEGs in `frames/`.
//
// THE READERS BELOW ARE COPIED from `scripts/across-sign-candidates.ts` on purpose. That
// file is a one-off which exports nothing and ends in `main()`, and editing it to export
// would rewrite the very report this package has to agree with. The copy is held honest by
// `EXPECTED`: the run asserts its three set sizes against the numbers that report
// published, and stops rather than quietly producing a different round.
//
// RUN (from the repo root; needs `unzip` on PATH — git-bash ships it):
//
//   node_modules/.bin/esbuild docs/shaft/phase-audit/select.ts --bundle \
//     --platform=node --format=esm --outfile=<tmp>/select.mjs
//   node <tmp>/select.mjs            # builds the package
//   node <tmp>/select.mjs --dry-run  # derives and prints the three sets, writes nothing
//
// esbuild rather than a `.mjs`: the point is to run the REAL measurement modules, and those
// are TypeScript with extensionless imports Node cannot resolve on its own.

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildShaftMeasurements,
  checkShaftSeries,
  angleDeg,
  MEASUREMENT_PHASES,
  type MeasurementPhase,
  type ShaftFrameSample,
  type ShaftSwingSeries,
} from '../../../src/lib/shaft/measure/index';
import type { CameraAngle } from '../../../src/lib/cameraAngle';

// The repo root is the working directory, not the script's own folder: the bundle esbuild
// produces lives in a temp directory, so `import.meta.url` would point at the wrong tree.
const ROOT = process.cwd();
if (!existsSync(path.join(ROOT, 'package.json'))) {
  throw new Error(`kör från repo-roten — ${ROOT} har ingen package.json`);
}
const DATA = path.join(ROOT, 'data', 'shaft');
const OUT_DIR = path.join(ROOT, 'docs', 'shaft', 'phase-audit');
const OUT_FRAMES = path.join(OUT_DIR, 'frames');
const OUT_REVIEW = path.join(OUT_DIR, 'review.md');
const OUT_KEY = path.join(OUT_DIR, 'facit.md');
const OUT_README = path.join(OUT_DIR, 'README.md');

/**
 * Shuffle and sampling seed. Printed in the console, in the README and in the key, so the
 * order can be REPRODUCED and never has to be inferred. Distinct from the across-the-line
 * round's `0x5ca1ab1e` — two rounds sharing a seed would share an order.
 */
const SEED = 0xfa5ec0de;

/**
 * The set sizes `docs/shaft/across-sign-result.md` published, asserted rather than
 * recomputed silently. If the dataset or the readers drift, the run STOPS: a review round
 * built on a different 22 than the report describes would be measuring something else while
 * claiming to measure this.
 */
const EXPECTED = {
  dtlTopCandidates: 63,
  manifestBorne: 30,
  manifestBorneUncontested: 26,
  manifestBorneContradicted: 4,
  productionPath: 22,
};

/** Control strata: annotated phase → how many frames. Sums to 10. */
const CONTROL_QUOTA: readonly (readonly [MeasurementPhase, number])[] = [
  ['top', 4],
  ['backswing', 2],
  ['downswing', 2],
  ['finish', 2],
];

/**
 * The keypoint confidence the prelabel run guaranteed but did not record —
 * `training/prelabel_batch.py` drops any detection scoring below `--keypoint` (default 0.5).
 * The same floor `scripts/across-sign-candidates.ts` feeds the gate, because the two runs
 * have to agree frame for frame.
 */
const PRELABEL_CONF_FLOOR = 0.5;

// ── Reading the sources ──────────────────────────────────────────────────────

interface Prediction {
  frameId: string;
  batchDir: string;
  width: number;
  height: number;
  butt: { x: number; y: number };
  hosel: { x: number; y: number };
}

interface ManifestFrame {
  id: string;
  batchDir: string;
  clipName: string;
  swingIndex: number;
  tSec: number;
  phase: string;
  envelopeSec: [number, number] | null;
  impactSec: number | null;
  hasConfidentImpact: boolean;
  exportFile: string | null;
}

interface Annotated {
  /** The export this annotation was read out of, repo-relative — the phase's provenance. */
  source: string;
  view?: string;
  phase?: string;
  noShaft?: boolean;
  butt?: { x: number; y: number };
  hosel?: { x: number; y: number };
}

function batchDirs(): string[] {
  const base = path.join(DATA, 'training');
  return readdirSync(base)
    .filter((n) => n.startsWith('batch-'))
    .sort()
    .map((n) => path.join(base, n));
}

function unzip(zip: string, dest: string, member?: string): void {
  mkdirSync(dest, { recursive: true });
  const args = ['-o', '-q', zip];
  if (member) args.push(member);
  args.push('-d', dest);
  execFileSync('unzip', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/** `prelabel.xml` → the model's `butt`/`hosel`. `toe`/`heel` are synthesised there, and dropped here. */
function readPrelabel(batchDir: string): Prediction[] {
  const file = path.join(batchDir, 'prelabel.xml');
  if (!existsSync(file)) return [];
  const xml = readFileSync(file, 'utf8');
  const out: Prediction[] = [];
  const images = xml.matchAll(/<image\b([^>]*?)(?:\/>|>([\s\S]*?)<\/image>)/g);
  for (const image of images) {
    const attrs = image[1];
    const body = image[2] ?? '';
    if (!body.includes('<skeleton')) continue;
    const name = /name="([^"]+)"/.exec(attrs)?.[1];
    const width = Number(/width="(\d+)"/.exec(attrs)?.[1]);
    const height = Number(/height="(\d+)"/.exec(attrs)?.[1]);
    if (!name || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    const point = (label: string) => {
      const m = new RegExp(`<points label="${label}"[^>]*points="([-\\d.]+),([-\\d.]+)"`).exec(body);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    };
    const butt = point('butt');
    const hosel = point('hosel');
    if (!butt || !hosel) continue;
    out.push({ frameId: frameIdOf(name), batchDir, width, height, butt, hosel });
  }
  return out;
}

/** `frames/049-88216ea7_s00_f05.jpg` → `049-88216ea7_s00_f05`. */
function frameIdOf(fileName: string): string {
  return fileName.replace(/^.*\//, '').replace(/\.jpg$/i, '');
}

/** The swing a frame id belongs to — everything before `_fNN`. */
function swingOf(frameId: string): string | null {
  const m = /^(.*_s\d+)_f\d+$/.exec(frameId);
  return m ? m[1] : null;
}

function readManifests(work: string): Map<string, ManifestFrame> {
  const out = new Map<string, ManifestFrame>();
  for (const dir of batchDirs()) {
    const zip = path.join(dir, 'batch.zip');
    if (!existsSync(zip)) continue;
    const dest = path.join(work, 'manifest', path.basename(dir));
    unzip(zip, dest, 'manifest.json');
    const doc = JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
    for (const f of doc.frames as Record<string, unknown>[]) {
      out.set(String(f.id), {
        id: String(f.id),
        batchDir: dir,
        clipName: String(f.clipName),
        swingIndex: Number(f.swingIndex),
        tSec: Number(f.tSec),
        phase: String(f.phase),
        envelopeSec: (f.envelopeSec as [number, number] | null) ?? null,
        impactSec: (f.impactSec as number | null) ?? null,
        hasConfidentImpact: f.hasConfidentImpact === true,
        exportFile: f.exportFile ? String(f.exportFile) : null,
      });
    }
  }
  return out;
}

/** Every human-annotated export, auto-discovered exactly as `prelabel_batch.py` does. */
function annotationExports(): string[] {
  const found: string[] = [];
  const calib = path.join(DATA, 'calibration');
  if (existsSync(calib)) {
    for (const n of readdirSync(calib).sort()) {
      if (n.endsWith('.zip') && n !== 'calibration.zip') found.push(path.join(calib, n));
    }
  }
  for (const dir of batchDirs()) {
    for (const n of readdirSync(dir).sort()) {
      if (/^annotated.*\.zip$/.test(n)) found.push(path.join(dir, n));
    }
  }
  return found;
}

/**
 * Every human export, with the one measured judgement `across-sign-candidates.ts` makes: an
 * export whose `phase` attribute holds the SAME value on every frame carries no phase at
 * all. `batch-03/annotated-v1.zip` has `phase: address` on all 242 of its frames, and
 * `address` is that attribute's CVAT `default_value` — an untouched default is an unset
 * field wearing a value. Its phases are dropped; its views are kept, because those are set.
 */
function readAnnotations(work: string): {
  perFrame: Map<string, Annotated[]>;
  perExport: Map<string, number>;
  phaselessExports: Map<string, string>;
} {
  const perFrame = new Map<string, Annotated[]>();
  const perExport = new Map<string, number>();
  const phaselessExports = new Map<string, string>();
  for (const zip of annotationExports()) {
    const rel = path.relative(ROOT, zip).replace(/\\/g, '/');
    const dest = path.join(
      work,
      'ann',
      path.basename(path.dirname(zip)) + '-' + path.basename(zip, '.zip'),
    );
    unzip(zip, dest);
    const jsons = walk(dest).filter((p) => p.endsWith('.json'));
    const fromThisExport: Annotated[] = [];
    let n = 0;
    for (const jsonPath of jsons) {
      const doc = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const shaftIds = new Set(
        (doc.categories ?? [])
          .filter((c: Record<string, unknown>) => c.name === 'shaft')
          .map((c: Record<string, unknown>) => c.id),
      );
      const images = new Map<number, string>(
        (doc.images ?? []).map((i: Record<string, unknown>) => [i.id as number, String(i.file_name)]),
      );
      for (const ann of doc.annotations ?? []) {
        if (!shaftIds.has(ann.category_id)) continue;
        const file = images.get(ann.image_id);
        if (!file) continue;
        const id = frameIdOf(file);
        const attrs = (ann.attributes ?? {}) as Record<string, unknown>;
        const kp = (ann.keypoints ?? []) as number[];
        const entry: Annotated = {
          source: rel,
          view: attrs.view ? String(attrs.view) : undefined,
          phase: attrs.phase ? String(attrs.phase) : undefined,
          noShaft: attrs.no_shaft === true,
        };
        // COCO keypoint order is the category's: butt, hosel, toe, heel.
        if (kp.length >= 6 && kp[2] > 0 && kp[5] > 0) {
          entry.butt = { x: kp[0], y: kp[1] };
          entry.hosel = { x: kp[3], y: kp[4] };
        }
        const list = perFrame.get(id) ?? [];
        list.push(entry);
        perFrame.set(id, list);
        fromThisExport.push(entry);
        n += 1;
      }
    }
    perExport.set(rel, n);
    const phases = new Set(fromThisExport.map((e) => e.phase).filter(Boolean));
    if (phases.size === 1 && fromThisExport.length > 1) {
      phaselessExports.set(rel, [...phases][0]!);
      for (const e of fromThisExport) e.phase = undefined;
    }
  }
  return { perFrame, perExport, phaselessExports };
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

// ── View, phase, series ──────────────────────────────────────────────────────

type ViewBucket = 'dtl' | 'face_on' | 'other' | 'unknown';

/** `prelabel_batch.py` → `view_bucket()`, value for value. Subset, never equality. */
function viewBucket(views: Set<string> | undefined): ViewBucket {
  if (!views || views.size === 0) return 'unknown';
  const all = [...views];
  if (all.every((v) => v === 'dtl')) return 'dtl';
  if (all.every((v) => v === 'dtl' || v === 'face_on')) return 'face_on';
  return 'other';
}

function asPhase(value: string | undefined): MeasurementPhase | null {
  return value && (MEASUREMENT_PHASES as readonly string[]).includes(value)
    ? (value as MeasurementPhase)
    : null;
}

interface FrameRecord {
  frameId: string;
  swingKey: string;
  pred: Prediction;
  manifest: ManifestFrame;
  annPhase: MeasurementPhase | null;
  annPhaseSource: string | null;
  annView: string | null;
  phase: MeasurementPhase;
}

function toSeries(
  swingKey: string,
  list: FrameRecord[],
  cameraAngle: CameraAngle | null,
): ShaftSwingSeries {
  const frames: ShaftFrameSample[] = list.map((r) => ({
    tSec: r.manifest.tSec,
    phase: r.phase,
    // The provenance the phase already had, now said out loud (`PhaseSource`). The
    // annotator SAW the frame, so an annotated phase is `observed`; the manifest's is
    // `derivePhase` output, and which of its two branches ran is exactly whether the
    // swing had a confident impact. Nothing is invented here — the same three cases this
    // tool's own `phaseSource` column has always reported, in the type the measurement
    // layer reads.
    phaseSource: r.annPhase
      ? ('observed' as const)
      : r.manifest.impactSec !== null
        ? ('envelope-impact' as const)
        : ('envelope-fallback' as const),
    butt: { ...r.pred.butt, conf: PRELABEL_CONF_FLOOR },
    hosel: { ...r.pred.hosel, conf: PRELABEL_CONF_FLOOR },
    toe: null,
    heel: null,
    shaftAngleDeg: angleDeg(r.pred.butt, r.pred.hosel),
    bladeAngleDeg: null,
    body: null,
  }));
  return {
    clipName: list[0].manifest.clipName,
    swingIndex: list[0].manifest.swingIndex,
    cameraAngle,
    imageSize: { width: list[0].pred.width, height: list[0].pred.height },
    // Two keypoints, and that is not a simplification: `shaft-v2.onnx` is the two-point
    // checkpoint, and the `toe`/`heel` in `prelabel.xml` are drawn, not predicted.
    model: { file: 'public/models/shaft-v2.onnx', keypoints: 2, provider: 'onnx-cpu (prelabel_batch.py)' },
    frames,
    producedAt: new Date(0).toISOString(),
    appVersion: `phase-audit/${swingKey}`,
  };
}

// ── Seeded order ─────────────────────────────────────────────────────────────

/** mulberry32: small, seeded, and the same sequence on every platform. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, back to front, on a copy. */
function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── The envelope's own frames, for context ───────────────────────────────────

interface ExportFrame {
  id: string;
  zip: string;
  swingKey: string;
  tSec: number;
}

/**
 * Every frame the envelope selection produced, per swing, out of `data/shaft/exports/`.
 *
 * NOT the training batches: those are a SUBSAMPLE (`build-training-batch.mjs` draws at most
 * 2 frames per swing in batch-03), so the neighbour of a frame inside a batch can be a
 * second away. The exports are the selection's own output — up to 7 frames per swing —
 * which is what "the nearest preceding and following envelope frame" has to mean if the
 * context is to be worth looking at.
 */
function readExportFrames(work: string): Map<string, ExportFrame[]> {
  const bySwing = new Map<string, ExportFrame[]>();
  const dir = path.join(DATA, 'exports');
  if (!existsSync(dir)) return bySwing;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.zip')) continue;
    const zip = path.join(dir, name);
    const dest = path.join(work, 'export', path.basename(name, '.zip'));
    unzip(zip, dest, 'manifest.json');
    const doc = JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
    for (const f of doc.frames as Record<string, unknown>[]) {
      const id = String(f.id);
      const swingKey = swingOf(id);
      if (!swingKey) continue;
      const list = bySwing.get(swingKey) ?? [];
      list.push({ id, zip, swingKey, tSec: Number(f.tSec) });
      bySwing.set(swingKey, list);
    }
  }
  for (const list of bySwing.values()) list.sort((a, b) => a.tSec - b.tSec);
  return bySwing;
}

// ── Clip length and fps, from the file or not at all ─────────────────────────

interface VideoMeta {
  durationSec: number | null;
  fps: number | null;
  /** Why the numbers are missing, when they are. */
  note: string | null;
}

/** `001.mp4` → `data/shaft/clips/001.mp4`; `IMG_3641.MP4` → `data/shaft/clips/own/…`. */
function clipPath(clipName: string): string | null {
  for (const candidate of [
    path.join(DATA, 'clips', clipName),
    path.join(DATA, 'clips', 'own', clipName),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Clip length and frame rate READ OUT OF THE MP4, because nothing else in the repo records
 * them: neither the export manifest nor the batch manifest carries a duration or an fps,
 * and no `ffprobe` is on PATH here. A minimal box walk is the honest way to get them — the
 * alternative is a number derived from the envelope, which would be the swing's length
 * wearing the clip's name.
 *
 * Returns nulls with a reason when the clip file is not in the repo. Most `own` clips are
 * not: `data/shaft/clips/own/` holds one file.
 */
function readVideoMeta(clipName: string): VideoMeta {
  const file = clipPath(clipName);
  if (!file) return { durationSec: null, fps: null, note: 'klippfilen finns inte i repot' };
  const fd = openSync(file, 'r');
  try {
    const moov = findBox(fd, 0, fileSize(fd), 'moov');
    if (!moov) return { durationSec: null, fps: null, note: 'ingen moov-box' };
    const mvhd = findBox(fd, moov.start, moov.end, 'mvhd');
    let durationSec: number | null = null;
    if (mvhd) {
      const head = readAt(fd, mvhd.start, Math.min(32, mvhd.end - mvhd.start));
      const version = head[0];
      const timescale = version === 1 ? head.readUInt32BE(20) : head.readUInt32BE(12);
      const duration = version === 1 ? Number(head.readBigUInt64BE(24)) : head.readUInt32BE(16);
      if (timescale > 0) durationSec = duration / timescale;
    }
    let fps: number | null = null;
    for (const trak of findBoxes(fd, moov.start, moov.end, 'trak')) {
      const mdia = findBox(fd, trak.start, trak.end, 'mdia');
      if (!mdia) continue;
      const hdlr = findBox(fd, mdia.start, mdia.end, 'hdlr');
      if (!hdlr) continue;
      const handler = readAt(fd, hdlr.start, Math.min(16, hdlr.end - hdlr.start))
        .subarray(8, 12)
        .toString('latin1');
      if (handler !== 'vide') continue;
      const mdhd = findBox(fd, mdia.start, mdia.end, 'mdhd');
      const minf = findBox(fd, mdia.start, mdia.end, 'minf');
      const stbl = minf ? findBox(fd, minf.start, minf.end, 'stbl') : null;
      const stts = stbl ? findBox(fd, stbl.start, stbl.end, 'stts') : null;
      if (!mdhd || !stts) continue;
      const mh = readAt(fd, mdhd.start, Math.min(32, mdhd.end - mdhd.start));
      const version = mh[0];
      const timescale = version === 1 ? mh.readUInt32BE(20) : mh.readUInt32BE(12);
      const mediaDuration = version === 1 ? Number(mh.readBigUInt64BE(24)) : mh.readUInt32BE(16);
      const table = readAt(fd, stts.start, stts.end - stts.start);
      const entries = table.readUInt32BE(4);
      let samples = 0;
      for (let i = 0; i < entries; i += 1) samples += table.readUInt32BE(8 + i * 8);
      if (timescale > 0 && mediaDuration > 0) fps = samples / (mediaDuration / timescale);
      break;
    }
    return { durationSec, fps, note: null };
  } finally {
    closeSync(fd);
  }
}

interface Box {
  /** First byte of the box PAYLOAD. */
  start: number;
  /** One past the last byte of the payload. */
  end: number;
}

function fileSize(fd: number): number {
  return fstatSync(fd).size;
}

function readAt(fd: number, offset: number, length: number): Buffer {
  const buffer = Buffer.alloc(Math.max(0, length));
  readSync(fd, buffer, 0, buffer.length, offset);
  return buffer;
}

/** Every direct child box of `[from, to)` with this type, payload bounds only. */
function findBoxes(fd: number, from: number, to: number, type: string): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    const header = readAt(fd, at, 16);
    let size = header.readUInt32BE(0);
    const boxType = header.subarray(4, 8).toString('latin1');
    let headerSize = 8;
    if (size === 1) {
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < headerSize) break;
    if (boxType === type) out.push({ start: at + headerSize, end: at + size });
    at += size;
  }
  return out;
}

function findBox(fd: number, from: number, to: number, type: string): Box | null {
  return findBoxes(fd, from, to, type)[0] ?? null;
}

// ── The three sets ───────────────────────────────────────────────────────────

/** How a `top`-labelled candidate got its label. Named after the report's own three rows. */
type LabelOrigin = 'annotatören sa top' | 'manifest, oemotsagt' | 'manifest, motsagt';

interface Candidate {
  frameId: string;
  swingKey: string;
  record: FrameRecord;
  origin: LabelOrigin;
  /** True when this is the frame `topFrameIndex` returns for the swing. */
  onProductionPath: boolean;
}

interface Row {
  frameId: string;
  swingKey: string;
  kind: 'kandidat' | 'kontroll';
  /** The phase the row is being tested against, and where it came from. */
  phase: MeasurementPhase;
  phaseSource: 'manifest (härledd)' | 'annotation';
  phaseProvenance: string;
  manifest: ManifestFrame;
  imageZip: string;
}

function main(): void {
  const work = mkdtempSync(path.join(tmpdir(), 'phase-audit-'));
  try {
    run(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function run(work: string): void {
  const dryRun = process.argv.includes('--dry-run');

  // 1. The three sources, read exactly as the candidate report reads them.
  const predictions = batchDirs().flatMap(readPrelabel);
  const manifests = readManifests(work);
  const { perFrame: annotations, phaselessExports } = readAnnotations(work);

  // Views are unioned per SWING: the camera does not move during a swing, so one annotated
  // frame labels the whole of it.
  const swingViews = new Map<string, Set<string>>();
  for (const [frameId, list] of annotations) {
    const swing = swingOf(frameId);
    if (!swing) continue;
    const set = swingViews.get(swing) ?? new Set<string>();
    for (const a of list) if (a.view) set.add(a.view);
    swingViews.set(swing, set);
  }

  // 2. One record per predicted frame, joined to its manifest row and its annotation.
  const records: FrameRecord[] = [];
  for (const pred of predictions) {
    const manifest = manifests.get(pred.frameId);
    const swingKey = swingOf(pred.frameId);
    if (!manifest || !swingKey) continue;
    const anns = annotations.get(pred.frameId) ?? [];
    // First pass that set a phase wins, as `across-sign-candidates.ts` does. Unambiguous
    // here: predictions exist only for batch-02 and batch-03 (batch-01 has no
    // `prelabel.xml`), each annotated once, and the calibration ids are reserved out of the
    // batches — so no candidate frame has two annotated phases to choose between.
    const withPhase = anns.find((a) => asPhase(a.phase));
    const annPhase = asPhase(withPhase?.phase);
    const annView = anns.map((a) => a.view).find(Boolean) ?? null;
    const manifestPhase = asPhase(manifest.phase);
    const phase = annPhase ?? manifestPhase;
    if (!phase) continue;
    records.push({
      frameId: pred.frameId,
      swingKey,
      pred,
      manifest,
      annPhase,
      annPhaseSource: annPhase ? (withPhase?.source ?? null) : null,
      annView,
      phase,
    });
  }

  // 3. Group into swings and run the production path over each.
  const bySwing = new Map<string, FrameRecord[]>();
  for (const r of records) {
    const list = bySwing.get(r.swingKey) ?? [];
    list.push(r);
    bySwing.set(r.swingKey, list);
  }

  const candidates: Candidate[] = [];
  for (const [swingKey, list] of [...bySwing].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.manifest.tSec - b.manifest.tSec);
    const bucket = viewBucket(swingViews.get(swingKey));
    if (bucket !== 'dtl') continue;

    const series = toSeries(swingKey, list, 'dtl');
    const checked = checkShaftSeries(series);
    // `handedness: 'right'` is the whole table's assumption, not a claim about the player.
    // It changes the sign of the across/laid-off verdict and nothing about WHICH frame
    // `topFrameIndex` picks, which is all this tool reads off the measurement.
    const measurement = buildShaftMeasurements(checked, { handedness: 'right' }).topShaftOrientation;
    const chosenIndex = measurement.value?.frameIndex ?? null;

    for (const [index, record] of list.entries()) {
      const annIsTop = record.annPhase === 'top';
      const manifestIsTop = record.manifest.phase === 'top';
      if (!annIsTop && !manifestIsTop) continue;
      const origin: LabelOrigin = annIsTop
        ? 'annotatören sa top'
        : record.annPhase === null
          ? 'manifest, oemotsagt'
          : 'manifest, motsagt';
      candidates.push({
        frameId: record.frameId,
        swingKey,
        record,
        origin,
        onProductionPath: chosenIndex === index,
      });
    }
  }

  // 4. The three sets, and the assertion that they are the report's.
  const manifestBorne = candidates.filter((c) => c.origin !== 'annotatören sa top');
  const productionPath = manifestBorne.filter((c) => c.onProductionPath);
  const counted = {
    dtlTopCandidates: candidates.length,
    manifestBorne: manifestBorne.length,
    manifestBorneUncontested: candidates.filter((c) => c.origin === 'manifest, oemotsagt').length,
    manifestBorneContradicted: candidates.filter((c) => c.origin === 'manifest, motsagt').length,
    productionPath: productionPath.length,
  };

  printDerivation(counted, candidates, manifestBorne, productionPath, phaselessExports);

  const drift = Object.entries(EXPECTED).filter(
    ([k, v]) => counted[k as keyof typeof counted] !== v,
  );
  if (drift.length > 0) {
    throw new Error(
      'SIFFRORNA STÄMMER INTE med docs/shaft/across-sign-result.md — inget paket byggt.\n' +
        drift
          .map(([k, v]) => `  ${k}: väntat ${v}, fick ${counted[k as keyof typeof counted]}`)
          .join('\n') +
        '\nHärledningen står ovan. Ta reda på varför innan något byggs på den här mängden.',
    );
  }

  // 5. Controls: frames a human labelled, stratified, from swings no candidate is in.
  const next = rng(SEED);
  const candidateSwings = new Set(productionPath.map((c) => c.swingKey));
  const controls = pickControls(manifests, annotations, swingViews, candidateSwings, next);

  printControls(controls);

  if (dryRun) {
    console.log('\n--dry-run: inget skrivet.');
    return;
  }

  // 6. The round.
  const rows: Row[] = [
    ...productionPath.map(
      (c): Row => ({
        frameId: c.frameId,
        swingKey: c.swingKey,
        kind: 'kandidat',
        phase: 'top',
        phaseSource: 'manifest (härledd)',
        phaseProvenance: `${path.relative(ROOT, c.record.manifest.batchDir).replace(/\\/g, '/')}/batch.zip → manifest.json`,
        manifest: c.record.manifest,
        imageZip: path.join(c.record.pred.batchDir, 'batch.zip'),
      }),
    ),
    ...controls.map(
      (c): Row => ({
        frameId: c.frameId,
        swingKey: c.swingKey,
        kind: 'kontroll',
        phase: c.phase,
        phaseSource: 'annotation',
        phaseProvenance: c.sources.join('<br>'),
        manifest: c.manifest,
        imageZip: path.join(c.manifest.batchDir, 'batch.zip'),
      }),
    ),
  ];

  guardFilledReview();

  const order = shuffle(rows, next);
  const exportFrames = readExportFrames(work);
  const context = copyFrames(order, exportFrames, work);
  writeRound(order, context, exportFrames);

  console.log(
    `\npaket: ${path.relative(ROOT, OUT_DIR).replace(/\\/g, '/')} · ${order.length} rader ` +
      `(${productionPath.length} kandidater + ${controls.length} kontroller) · frö 0x${SEED.toString(16)}`,
  );
}

function printDerivation(
  counted: Record<string, number>,
  candidates: Candidate[],
  manifestBorne: Candidate[],
  productionPath: Candidate[],
  phaselessExports: Map<string, string>,
): void {
  const line = (s = '') => console.log(s);
  line('HÄRLEDNING');
  line('');
  line('a) dtl-toppkandidater');
  line('   prelabel.xml (butt+hosel) ⋈ batch.zip/manifest.json ⋈ annoterade exporter,');
  line('   grupperat per sving, svingar med vy-bucket dtl (unionerad per sving),');
  line('   varje bildruta där annotatörens fas ELLER manifestets fas är `top`.');
  for (const [file, value] of phaselessExports) {
    line(`   kastad fas: ${file} bär \`${value}\` på varje bildruta (CVAT default_value).`);
  }
  line(`   → ${counted.dtlTopCandidates} bildrutor`);
  line('');
  line('b) de som vilar på manifestets fas');
  line('   = (a) minus de bildrutor där annotatören själv sa `top`.');
  for (const origin of ['annotatören sa top', 'manifest, oemotsagt', 'manifest, motsagt'] as const) {
    line(`     ${origin.padEnd(22)} ${candidates.filter((c) => c.origin === origin).length}`);
  }
  line(`   → ${counted.manifestBorne} bildrutor (${counted.manifestBorneUncontested} oemotsagda + ${counted.manifestBorneContradicted} motsagda)`);
  line('');
  line('c) produktionsvägens val');
  line('   = (b) där topFrameIndex i derived.ts returnerar just den bildrutan, avläst som');
  line('   topShaftOrientation.value.frameIndex efter checkShaftSeries → buildShaftMeasurements.');
  line(`   → ${counted.productionPath} bildrutor`);
  line('');
  for (const c of [...productionPath].sort((a, b) => a.frameId.localeCompare(b.frameId))) {
    const m = c.record.manifest;
    line(`   ${c.frameId.padEnd(30)} ${m.clipName.padEnd(18)} impactSec ${m.impactSec === null ? 'saknas' : m.impactSec.toFixed(3)}`);
  }
  const offPath = manifestBorne.filter((c) => !c.onProductionPath);
  line('');
  line(`   utanför produktionsvägen i (b): ${offPath.length}`);
  for (const c of [...offPath].sort((a, b) => a.frameId.localeCompare(b.frameId))) {
    line(`     ${c.frameId.padEnd(30)} ${c.origin}`);
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────

interface Control {
  frameId: string;
  swingKey: string;
  phase: MeasurementPhase;
  /** Every export that set this phase — more than one when the frame was annotated twice. */
  sources: string[];
  manifest: ManifestFrame;
}

/**
 * Ten frames whose phase a human actually set, stratified over four phases.
 *
 * WHY THEY ARE HERE. Without controls the round measures agreement between one eye and one
 * label, and an eye that judges 22 frames all labelled `top` knows it is judging 22 frames
 * all labelled `top`. Mixing in frames with a phase somebody already annotated does two
 * things: it hides the candidates, and it gives the round its own error bar — a reviewer who
 * misses the controls has not established anything about the candidates.
 *
 * WHAT COUNTS AS RELIABLE, and it is a narrow definition on purpose:
 *
 *  - The phase must come from an export that carries real phases. `batch-03/annotated-v1.zip`
 *    does not (see `readAnnotations`), and its frames are excluded a second time BY NAME
 *    below, so the rule survives a future export that happens to vary its default.
 *  - Every pass that annotated the frame must agree. batch-01 was annotated twice and the
 *    two passes differ on 10 of 146 frames (`annotated-v1.zip` vs `annotated-v2.zip`, the
 *    pass `phase-corrected.json` came out of). A frame whose own annotators disagree is not
 *    a phase anything can be scored against, whichever pass one declares the later one.
 *  - The swing must be `dtl`, like every candidate. A `face_on` control would be
 *    recognisable as a control from the image alone.
 *  - The swing must carry no candidate, so no row in the round is a neighbour of another.
 *  - One control per swing, for the same reason.
 */
function pickControls(
  manifests: Map<string, ManifestFrame>,
  annotations: Map<string, Annotated[]>,
  swingViews: Map<string, Set<string>>,
  candidateSwings: Set<string>,
  next: () => number,
): Control[] {
  const denied = /batch-03/;
  const pool: Control[] = [];
  const seenSwings = new Set<string>();
  // Every frame in a batch manifest, not only the predicted ones: a control needs an image
  // and an annotated phase, not a shaft prediction. batch-01 has no `prelabel.xml` at all,
  // and it is the batch whose phases were corrected in a second pass (`phase-corrected.json`).
  for (const [frameId, list] of [...annotations].sort((a, b) => a[0].localeCompare(b[0]))) {
    const manifest = manifests.get(frameId);
    const swingKey = swingOf(frameId);
    if (!manifest || !swingKey) continue;
    if (candidateSwings.has(swingKey)) continue;
    if (viewBucket(swingViews.get(swingKey)) !== 'dtl') continue;
    const passes = list.filter((a) => asPhase(a.phase) && !denied.test(a.source));
    const phases = new Set(passes.map((a) => a.phase));
    if (passes.length === 0 || phases.size !== 1) continue;
    const phase = asPhase(passes[0].phase);
    if (!phase) continue;
    if (list.some((a) => a.noShaft)) continue;
    pool.push({
      frameId,
      swingKey,
      phase,
      sources: [...new Set(passes.map((a) => a.source))],
      manifest,
    });
  }

  const out: Control[] = [];
  for (const [phase, quota] of CONTROL_QUOTA) {
    const stratum = shuffle(
      pool.filter((c) => c.phase === phase),
      next,
    );
    let taken = 0;
    for (const c of stratum) {
      if (taken >= quota) break;
      if (seenSwings.has(c.swingKey)) continue;
      seenSwings.add(c.swingKey);
      out.push(c);
      taken += 1;
    }
    if (taken < quota) {
      throw new Error(
        `kontrollurvalet: bara ${taken} av ${quota} bildrutor med annoterad fas \`${phase}\` ` +
          `uppfyller kraven (dtl, egen sving, pålitlig fas). Stratumet går inte att fylla — ` +
          `inget paket byggt.`,
      );
    }
  }
  return out;
}

function printControls(controls: Control[]): void {
  console.log('');
  console.log('KONTROLLER (annoterad fas, ej batch-03)');
  for (const c of controls) {
    console.log(`   ${c.frameId.padEnd(30)} ${c.phase.padEnd(10)} ${c.sources.join(' + ')}`);
  }
}

// ── Frames ───────────────────────────────────────────────────────────────────

interface ContextFrames {
  prev: string | null;
  next: string | null;
}

/**
 * The 32 frames, plus the envelope neighbour on each side where the export has one.
 *
 * CONTEXT FOR EVERY ROW, not only the ones I found hard. Which frames are hard to place is
 * itself a judgement about the frame, and a round where only some rows carry context tells
 * the reviewer which ones somebody has already found ambiguous. A uniform rule says nothing.
 *
 * The neighbours are named `<id>_prev` / `<id>_next` after the ROW, never after themselves,
 * so the file listing carries no time order and no clue about which row is which.
 */
function copyFrames(
  rows: Row[],
  exportFrames: Map<string, ExportFrame[]>,
  work: string,
): Map<string, ContextFrames> {
  rmSync(OUT_FRAMES, { recursive: true, force: true });
  mkdirSync(OUT_FRAMES, { recursive: true });
  const staging = path.join(work, 'frames');
  const context = new Map<string, ContextFrames>();

  for (const row of rows) {
    unzip(row.imageZip, staging, `frames/${row.frameId}.jpg`);
    copyFileSync(
      path.join(staging, 'frames', `${row.frameId}.jpg`),
      path.join(OUT_FRAMES, `${row.frameId}.jpg`),
    );

    const siblings = exportFrames.get(row.swingKey) ?? [];
    const at = siblings.findIndex((f) => f.id === row.frameId);
    const before = at > 0 ? siblings[at - 1] : null;
    const after = at >= 0 && at + 1 < siblings.length ? siblings[at + 1] : null;
    const copySibling = (sibling: ExportFrame | null, suffix: 'prev' | 'next'): string | null => {
      if (!sibling) return null;
      unzip(sibling.zip, staging, `frames/${sibling.id}.jpg`);
      const name = `${row.frameId}_${suffix}.jpg`;
      copyFileSync(path.join(staging, 'frames', `${sibling.id}.jpg`), path.join(OUT_FRAMES, name));
      return name;
    };
    context.set(row.frameId, {
      prev: copySibling(before, 'prev'),
      next: copySibling(after, 'next'),
    });
  }
  return context;
}

// ── The round ────────────────────────────────────────────────────────────────

const VERDICTS = 'address / backswing / top / downswing / impact / finish / osäker';

/** A filled-in review cannot be regenerated, so a second run stops instead of erasing it. */
function guardFilledReview(): void {
  if (!existsSync(OUT_REVIEW)) return;
  const filled = readFileSync(OUT_REVIEW, 'utf8')
    .split('\n')
    .filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .filter((l) => {
      const cells = l.split('|');
      return (cells[cells.length - 2] ?? '').trim() !== '';
    });
  if (filled.length > 0 && !process.argv.includes('--force')) {
    throw new Error(
      `${path.relative(ROOT, OUT_REVIEW).replace(/\\/g, '/')} har ${filled.length} ifyllda rader — ` +
        `kör med --force för att skriva över dem (de går inte att återskapa).`,
    );
  }
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

function envelopeFraction(m: ManifestFrame): number | null {
  if (!m.envelopeSec) return null;
  const [start, finish] = m.envelopeSec;
  return finish > start ? (m.tSec - start) / (finish - start) : null;
}

function writeRound(
  order: Row[],
  context: Map<string, ContextFrames>,
  exportFrames: Map<string, ExportFrame[]>,
): void {
  const seedHex = `0x${SEED.toString(16)}`;
  const today = new Date().toISOString().slice(0, 10);
  const dir = path.basename(OUT_FRAMES);

  const link = (file: string | null) => (file ? `[bild](${dir}/${file})` : '—');

  const review = `# Blind fasgranskning — är bildrutan verkligen en topp?

> ${order.length} bildrutor att bedöma för hand. Ordningen är slumpad med fast frö
> **\`${seedHex}\`** och **bär ingen information**: varken radnumret, filnamnet eller
> grannraderna säger något om svaret. Genererad ${today} av
> \`docs/shaft/phase-audit/select.ts\`.

## Vad som ska fyllas i

För varje bildruta: **vilken fas i svingen visar den?**

\`${VERDICTS}\`

- \`top\` betyder att klubban vänder **i den här bildrutan** — sista bildrutan innan
  nedsvingen börjar, inte "sen baksving" och inte "strax efter vändningen".
- \`osäker\` är ett riktigt svar. Använd det hellre än att gissa; en gissning som råkar bli
  rätt är oskiljbar från en bedömning, och den förstör siffran den här omgången ska ge.
- **Bedöm bildrutan i kolumnen \`bild\`.** Kolumnerna \`före\` och \`efter\` är närmaste
  envelope-bildruta på var sida — de finns för att visa åt vilket håll klubban rör sig, och
  ska **inte** bedömas i sig.

Skriv svaret i sista kolumnen. **Läs ingenting annat i \`docs/shaft/phase-audit/\` förrän
alla rader är ifyllda.**

| # | frame-id | bild | före | efter | din bedömning |
|---:|---|---|---|---|---|
${order
  .map((r, i) => {
    const c = context.get(r.frameId) ?? { prev: null, next: null };
    return `| ${i + 1} | \`${r.frameId}\` | [\`${r.frameId}.jpg\`](${dir}/${r.frameId}.jpg) | ${link(c.prev)} | ${link(c.next)} | |`;
  })
  .join('\n')}
`;

  const clipMeta = new Map<string, VideoMeta>();
  const metaFor = (clipName: string): VideoMeta => {
    const cached = clipMeta.get(clipName);
    if (cached) return cached;
    const meta = readVideoMeta(clipName);
    clipMeta.set(clipName, meta);
    return meta;
  };

  const keyRows = order.map((r, i) => {
    const m = r.manifest;
    const frac = envelopeFraction(m);
    const meta = metaFor(m.clipName);
    const envelope = m.envelopeSec ? `${fmt(m.envelopeSec[0], 3)}–${fmt(m.envelopeSec[1], 3)}` : '—';
    const impact = m.impactSec === null ? '**nej**' : `ja (${fmt(m.impactSec, 3)} s)`;
    const clipLen = meta.durationSec === null ? `— (${meta.note})` : `${fmt(meta.durationSec, 2)} s`;
    const fps = meta.fps === null ? '—' : fmt(meta.fps, 2);
    const siblings = exportFrames.get(r.swingKey) ?? [];
    const at = siblings.findIndex((f) => f.id === r.frameId);
    const position = at < 0 ? '—' : `${at + 1}/${siblings.length}`;
    return (
      `| ${i + 1} | \`${r.frameId}\` | \`${r.phase}\` | ${r.phaseSource} | **${r.kind}** | ` +
      `${frac === null ? '—' : fmt(frac, 3)} | ${impact} | ${m.clipName} | ${clipLen} | ${fps} | ` +
      `${envelope} | ${fmt(m.tSec, 3)} | ${position} | ${r.phaseProvenance} |`
    );
  });

  const key = `# Facit till fasgranskningen

> **Öppna inte förrän [review.md](review.md) är ifylld.** Genererad ${today} av
> \`docs/shaft/phase-audit/select.ts\`, samma körning som review-filen. Frö: \`${seedHex}\`.

## Vad raderna är

- **kandidat** — en av de ${EXPECTED.productionPath} bildrutor som bär \`top\` ur manifestet
  *och* är produktionsvägens val: den bildruta \`topFrameIndex\` i \`derived.ts\` faktiskt
  räknar \`top-shaft-orientation\` på. Fasen är härledd ur envelopens proportioner, inte
  observerad. Här mäts felfrekvensen.
- **kontroll** — en bildruta vars fas en annotatör satt för hand, utanför
  \`batch-03/annotated-v1.zip\` (vars \`phase\` är CVAT:s orörda förval). Kontrollerna mäter
  omgången, inte mätvärdet: missas de, säger kandidatraderna ingenting.

\`envelope-andel\` är \`(tSec − start) / (finish − start)\`. \`FALLBACK_BOUNDS\` i
\`src/lib/dataset/datasetPhase.ts\` kallar 0,45–0,52 för \`top\`, och **det fönstret är hela
skälet till att kandidatraderna heter \`top\`** när \`impactSec\` saknas.

| # | frame-id | fas | källa | rad | envelope-andel | impactSec | källklipp | klipplängd | fps | envelope (s) | tSec | plats i envelopen | fasens ursprung |
|---:|---|---|---|---|---:|---|---|---:|---:|---|---:|---|---|
${keyRows.join('\n')}

\`plats i envelopen\` är bildrutans nummer bland svingens envelope-bildrutor i
\`data/shaft/exports/\` — den förklarar vilka rader som saknar \`före\` eller \`efter\` i
review-filen (första respektive sista bildrutan i svingen).

## Klipplängd och fps

Lästa ur MP4-filens \`mvhd\`/\`mdhd\`+\`stts\` i \`data/shaft/clips/\`. Varken batch-manifestet
eller exportmanifestet bär någon av dem, och ingen \`ffprobe\` finns på PATH här — därför
läses de ur filen eller inte alls. Klipp som inte ligger i repot får \`—\`, aldrig ett tal
härlett ur envelopen: envelopens längd är svingens, inte klippets.
`;

  writeFileSync(OUT_REVIEW, review, 'utf8');
  writeFileSync(OUT_KEY, key, 'utf8');
  writeFileSync(OUT_README, readme(order, seedHex, today), 'utf8');
}

function readme(order: Row[], seedHex: string, today: string): string {
  const candidates = order.filter((r) => r.kind === 'kandidat').length;
  const controls = order.filter((r) => r.kind === 'kontroll').length;
  return `# Blind fasgranskning av \`top\` — metod

> Byggd ${today} av [\`select.ts\`](select.ts), ett **engångsverktyg som bara läser**. Ingen
> produktionskod är rörd: \`derived.ts\`, \`plausibility.ts\` och trösklarna
> \`NEAR_VERTICAL_GATE_DEG\` / \`ON_PLANE_BAND_DEG\` är oförändrade, och ingen fix är byggd.
> **Frö: \`${seedHex}\`.**

> **Läs den här filen efter [review.md](review.md), inte före.** Den bär inte svaren, men den
> bär rundans sammansättning: hur många rader som är kandidater, hur många som är kontroller
> och vilka faser kontrollerna har. Vet man det, vet man ungefär hur många \`top\` man ska
> hitta — och då är bedömningen inte längre helt blind. Metoden står här för att den ska gå
> att granska, inte för att den ska läsas som förberedelse.

## Frågan

\`topFrameIndex\` läser \`frame.phase === 'top'\` och kan inte se var etiketten kommer ifrån.
Saknas \`impactSec\` faller \`derivePhase\` tillbaka på \`FALLBACK_BOUNDS\` i
\`src/lib/dataset/datasetPhase.ts\`, och allt i fönstret **0,45–0,52 av envelopen** döps till
\`top\`. Etiketten betyder då *"omkring 48 % in i svingen"* — en proportion, inte en
observation. Ett fall är bevisat fel: \`img-3641-adde195e_s00_f02\` bär \`top\` ur manifestet
och visar en genomsving ([../across-sign-result.md](../across-sign-result.md) → §4).

**Hur ofta det händer är okänt**, och det går inte att räkna fram ur samma etiketter. Det här
paketet mäter det. Det bygger ingen fix — felfrekvensen ska finnas innan något byggs på den.

## Urvalet

Härlett av \`select.ts\`, som skriver ut hela härledningen i konsolen. Kör om, från repo-roten
(kräver \`unzip\` på PATH):

\`\`\`sh
node_modules/.bin/esbuild docs/shaft/phase-audit/select.ts --bundle --platform=node --format=esm --outfile=/tmp/select.mjs
node /tmp/select.mjs --dry-run   # bara härledningen, skriver ingenting
node /tmp/select.mjs             # bygger om paketet
\`\`\`

| Mängd | Antal | Härledning |
|---|---:|---|
| a) dtl-toppkandidater | ${EXPECTED.dtlTopCandidates} | \`prelabel.xml\` ⋈ \`batch.zip/manifest.json\` ⋈ annoterade exporter, svingar med vy-bucket \`dtl\`, varje bildruta där annotatörens **eller** manifestets fas är \`top\` |
| b) vilar på manifestfasen | ${EXPECTED.manifestBorne} | (a) minus de ${EXPECTED.dtlTopCandidates - EXPECTED.manifestBorne} där annotatören själv sa \`top\` — ${EXPECTED.manifestBorneUncontested} utan användbar annoterad fas, ${EXPECTED.manifestBorneContradicted} där annotatören säger emot |
| c) produktionsvägens val | ${EXPECTED.productionPath} | (b) där \`topFrameIndex\` returnerar just den bildrutan |

De tre talen **asserteras** mot [../across-sign-result.md](../across-sign-result.md) (\`EXPECTED\`
i skriptet). Stämmer de inte, stannar körningen och bygger ingenting — en omgång byggd på en
annan mängd än rapporten beskriver mäter något annat och säger att den mätte det här.

Rundan är **(c) + 10 kontroller = ${candidates + controls} rader**. Kontrollerna har en fas som en
annotatör satt för hand, stratifierade **4 \`top\` / 2 \`backswing\` / 2 \`downswing\` / 2
\`finish\`**, alla \`dtl\`, alla ur svingar där ingen kandidat ligger, högst en per sving.
\`batch-03/annotated-v1.zip\` är utesluten: dess \`phase\` är \`address\` på alla 242 bildrutor,
vilket är CVAT:s \`default_value\` — ett orört förval, inte en bedömning. **Och när en bildruta
är annoterad två gånger måste passen vara ense:** batch-01 har två pass som skiljer sig på 10
av 146 bildrutor, och en bildruta vars egna annotatörer är oense är ingen fas att mäta mot —
vilket pass man än utser till det senare. Sex av de tio kontrollerna är dubbelannoterade och
eniga; vilka pass som satt fasen står per rad i facit.

Ordningen är slumpad med **\`${seedHex}\`** (mulberry32 + Fisher-Yates). Samma frö styr
kontrollurvalet, så hela paketet går att återskapa: kör om skriptet.

## Bildrutorna

\`frames/<frame-id>.jpg\` är raden som ska bedömas. \`frames/<frame-id>_prev.jpg\` och
\`_next.jpg\` är närmaste envelope-bildruta före och efter — hämtade ur
\`data/shaft/exports/\`, alltså ur envelope-urvalets egen utdata (upp till 7 bildrutor per
sving) och inte ur träningsbatchen, som är ett glesare stickprov av samma sving.

\`frames/\` är **gitignorerad**, av samma skäl som \`docs/shaft/across-sign-candidates/\` och
\`data/shaft/*\`: samma identifierbara personer som originalen. Texten bredvid committas,
bilderna aldrig. I en färsk klon finns de alltså inte — kör om skriptet, och **samma frö ger
samma 32 rader i samma ordning**.

Kontexten finns för **varje** rad som har en granne, inte bara för de rutor jag tyckte var
svåra: vilka rutor som är svåra är i sig en bedömning, och en omgång där bara vissa rader bär
kontext berättar för granskaren vilka någon redan tvekat om. Grannarna heter efter **raden**,
inte efter sig själva, så fillistan bär ingen tidsordning.

## Så fylls review in

1. Öppna [review.md](review.md). Läs ingenting annat i den här mappen.
2. Bedöm bilden i kolumnen \`bild\`, en rad i taget. \`före\`/\`efter\` visar rörelseriktningen
   och ska inte bedömas i sig.
3. Skriv \`${VERDICTS}\` i sista kolumnen. \`top\` = klubban vänder **i den här bildrutan**.
4. \`osäker\` är ett riktigt svar och ska användas hellre än en gissning — en gissning som
   råkar bli rätt är oskiljbar från en bedömning och förstör siffran.
5. Först när alla ${candidates + controls} rader är ifyllda: öppna [facit.md](facit.md).

\`review.md\` länkar inte till facit, och facit står inte i \`select.ts\`:s utdata till
review-filen. En ny körning vägrar skriva över en ifylld review utan \`--force\`.

## Så görs utvärderingen efteråt

**Kontrollerna först.** Hur många av de 10 träffade annotatörens fas? Det är omgångens eget
felmått. Sitter felen där, mäter kandidatsiffran granskaren och inte etiketten, och
kandidatsiffran ska då inte tolkas.

**Sedan felfrekvensen bland de ${candidates}.** Andelen kandidatrader där bedömningen inte är
\`top\`. \`osäker\` räknas **inte** som fel — redovisa den som en egen tredje kategori (rätt /
fel / kan inte avgöras), precis som den blinda teckenomgången gjorde. En etikett som inte går
att bekräfta är inte samma sak som en etikett som är fel, och att slå ihop dem skulle göra
felfrekvensen till den siffra man råkade vilja ha.

**Sist: klustrar felen?** Facit bär kolumnerna som svarar på det, och varje jämförelse görs
mot kontrollerna och mot de kandidatrader som var rätt:

| Hypotes | Kolumn i facit | Vad som skulle synas |
|---|---|---|
| Vissa källklipp är genomgående felfasade | \`källklipp\` | flera fel ur samma klipp |
| Felet sitter i \`FALLBACK_BOUNDS\` | \`impactSec\` | fel nästan bara på rader utan \`impactSec\` |
| Långa klipp bär fler fel | \`klipplängd\`, \`envelope (s)\` | fel samlade i den övre delen av spannet |
| Fönstret 0,45–0,52 ligger fel | \`envelope-andel\` | fel samlade i ena änden av fönstret |

Sista raden är den intressanta och den svagaste: med ${candidates} rader räcker underlaget till
en riktning, inte till en tröskel. **Flytta ingenting på den här omgången** — precis som
\`ON_PLANE_BAND_DEG\` inte flyttades på n = 1. Vad omgången kan ge är en mätt felfrekvens
där det i dag står ett enda bevisat fall.

## Vad omgången inte kan svara på

- **De ${EXPECTED.dtlTopCandidates - EXPECTED.manifestBorne} rader där annotatören själv sa \`top\`** är inte med. De bär ett annat
  fel (en människas), och att blanda in dem hade gett ett medelvärde över två olika fel.
- **De ${EXPECTED.manifestBorne - EXPECTED.productionPath} manifestburna rader som inte är produktionsvägens val** är inte heller med:
  \`topFrameIndex\` räknar aldrig på dem, så deras fas kostar ingenting i dag.
- **Felfrekvensen gäller \`dtl\`-toppar i det här datasetet**, inte fasderiveringen i
  allmänhet. \`batch-03\`s annotatörsfas är oanvändbar, och det är den batchen som väger
  tyngst i (b).
`;
}

main();
