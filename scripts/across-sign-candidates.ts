// ONE-OFF, READ-ONLY — candidate frames for testing the across-the-line sign convention.
//
// WHY THIS EXISTS. `ACROSS_THE_LINE_SIGN` in `src/lib/shaft/measure/derived.ts` is
// verified against exactly ONE hand-read frame (`049-88216ea7_s00_f05`), whose shaft
// sits 77° from the image horizontal — 13° from the fold `lineOrientationDeg` performs
// at ±90°. A top whose shaft passes the vertical changes the measurement's sign with no
// warning, so the reference constrains the sign from the weakest end of the range. This
// tool does not settle anything; it lists the frames a human could look at to settle it,
// nearest the fold first, with which side of vertical each one lies on.
//
// IT CHANGES NOTHING. No production file is written and no threshold is overridden: the
// shaft series are fed straight through `checkShaftSeries` → `buildShaftMeasurements`,
// which is the same path the app uses. The only outputs are the report and the copied
// JPEGs under `docs/shaft/`.
//
// RUN (from the repo root; needs `unzip` on PATH — git-bash ships it):
//
//   node_modules/.bin/esbuild scripts/across-sign-candidates.ts --bundle \
//     --platform=node --format=esm --outfile=<tmp>/across-sign-candidates.mjs
//   node <tmp>/across-sign-candidates.mjs
//
// esbuild rather than a `.mjs`: the point of the tool is to run the REAL measurement
// modules, and those are TypeScript with extensionless imports that Node cannot resolve
// on its own. A hand-copied JS version of the arithmetic would be measuring itself.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ACROSS_THE_LINE_SIGN,
  ON_PLANE_BAND_DEG,
  buildShaftMeasurements,
  checkShaftSeries,
  lineOrientationDeg,
  angleDeg,
  MEASUREMENT_PHASES,
  type MeasurementPhase,
  type ShaftFrameSample,
  type ShaftSwingSeries,
} from '../src/lib/shaft/measure/index';
import type { CameraAngle } from '../src/lib/cameraAngle';

// The repo root is the working directory, not the script's own folder: the bundle esbuild
// produces lives in a temp directory, so `import.meta.url` would point at the wrong tree.
const ROOT = process.cwd();
if (!existsSync(path.join(ROOT, 'package.json'))) {
  throw new Error(`run from the repo root — ${ROOT} has no package.json`);
}
const DATA = path.join(ROOT, 'data', 'shaft');
const OUT_DOC = path.join(ROOT, 'docs', 'shaft', 'across-sign-candidates.md');
const OUT_FRAMES = path.join(ROOT, 'docs', 'shaft', 'across-sign-candidates');
const TOP_N_COPIED = 20;

/**
 * Where the top sits in a swing envelope when nothing measured says. The fraction is
 * `datasetPhase.ts` → `FALLBACK_BOUNDS`, whose `top` window is [0.45, 0.52] of
 * [start, finish]; this is its midpoint. Used ONLY for a swing in which no frame carries
 * the phase `top` at all, and every row it produces is marked as such in the report.
 */
const TURNING_POINT_FRAC = 0.485;

/**
 * The keypoint confidence the prelabel run guaranteed but did not record.
 * `training/prelabel_batch.py` drops any detection whose `butt` or `hosel` score is below
 * `--keypoint` (default 0.5) — so every prediction in `prelabel.xml` had at least this,
 * and no prediction in it has a recorded value. Feeding the floor through the gate is
 * therefore honest about the bound and dishonest about nothing: the report says in so
 * many words that the confidence test is passed by construction here, and that the frame
 * flags consequently carry geometry and neighbour evidence only.
 */
const PRELABEL_CONF_FLOOR = 0.5;

/**
 * WHAT THE EYE SAW, carried as data rather than written into the report by hand.
 *
 * Handedness exists nowhere in the dataset — not in the manifest, not among the CVAT
 * attributes — so the only way to answer "is there a left-handed frame at all" is to look.
 * These are hand-read verdicts on the copied frames (2026-09-17, Claude Code), kept here so
 * that a re-run either reproduces them or drops them when the frame leaves the top 20; a
 * paragraph typed straight into the generated markdown would survive its own evidence.
 *
 * `image` is handedness AS THE FRAME SHOWS IT, which is what the measurement sees — not a
 * claim about the player. `093-2c11c3c0` is the case where the two differ.
 */
const HAND_READ: Record<string, { image: 'right' | 'left'; top: boolean; note?: string }> = {
  '045-224bdedb_s00_f01': { image: 'right', top: true },
  '032-dc66dfc3_s00_f02': { image: 'right', top: true },
  'img-1558-8e59ca37_s02_f03': { image: 'right', top: true },
  '082-a6b3c908_s01_f02': { image: 'right', top: true },
  '049-88216ea7_s00_f04': { image: 'right', top: true, note: 'samma sving som referensen' },
  'img-5385-1f59ec8d_s00_f01': { image: 'right', top: true },
  'img-5384-acea6a74_s00_f02': { image: 'right', top: true },
  'img-5425-f0abd4a8_s02_f02': { image: 'right', top: true },
  'img-4949-218bb1b6_s00_f02': { image: 'right', top: true },
  'img-5425-f0abd4a8_s00_f01': { image: 'right', top: true },
  '021-68ef6599_s00_f02': { image: 'right', top: true },
  'img-4982-23afcab9_s00_f02': {
    image: 'right',
    top: false,
    note: 'genomsving/finish, inte en topp — manifestets `top` är fel, annotatörens `finish` är rätt',
  },
  '057-1d1b5748_s00_f02': { image: 'right', top: true },
  '075-3324b4b8_s00_f01': { image: 'right', top: true },
  'img-5414-79f3ebf2_s00_f02': { image: 'right', top: true, note: 'sen baksving, strax före toppen' },
  'img-5408-3c48779f_s01_f02': { image: 'right', top: true },
  '061-f51f439d_s00_f01': { image: 'right', top: true },
  '047-4d3e3909_s00_f01': { image: 'right', top: true },
  '073-bd53202e_s01_f01': { image: 'right', top: true, note: 'inomhus, ingen boll' },
  '093-2c11c3c0_s00_f02': {
    image: 'left',
    top: true,
    note:
      'BILDEN ÄR SPEGELVÄND: rangeskyltarna läser `TIH`/`ƎM` och distansmarkeringen `00Ɛ`. ' +
      'Spelaren är alltså högerhänt i verkligheten och vänsterhänt i bilden — och det är bilden mätvärdet ser',
  },
};

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
  clipName: string;
  swingIndex: number;
  tSec: number;
  phase: string;
  envelopeSec: [number, number] | null;
  impactSec: number | null;
}

interface Annotated {
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

/**
 * `prelabel.xml` → the model's `butt`/`hosel` for every frame it pre-labelled.
 *
 * `toe`/`heel` are read and DISCARDED on purpose. They are in the file, but
 * `sole_points()` in `prelabel_batch.py` synthesises them perpendicular to the shaft as
 * a handle for the annotator to drag — the shipped two-point model has no opinion about
 * the sole. Carrying them into `ShaftFrameSample` would manufacture a blade angle out of
 * the shaft angle and let `checkShaftSeries` report a blade rate for a measurement that
 * was never made.
 */
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

/** The swing a frame id belongs to — everything before `_fNN`, as `prelabel_batch.py` does. */
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
        clipName: String(f.clipName),
        swingIndex: Number(f.swingIndex),
        tSec: Number(f.tSec),
        phase: String(f.phase),
        envelopeSec: (f.envelopeSec as [number, number] | null) ?? null,
        impactSec: (f.impactSec as number | null) ?? null,
      });
    }
  }
  return out;
}

/**
 * Every human-annotated export, auto-discovered exactly as `prelabel_batch.py` does —
 * the calibration set plus every `annotated*.zip` next to a batch, superseded passes
 * included, because views are UNIONed and a corrected view still disqualifies its swing.
 */
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
 * Every human export, with one measured judgement applied to it: an export whose `phase`
 * attribute holds the SAME value on every single frame carries no phase at all.
 *
 * This is not a guess about annotator diligence, it is what the files say.
 * `batch-03/annotated-v1.zip` has `phase: address` on all 242 of its frames — `address`
 * is the attribute's CVAT `default_value`, and a default that was never touched is an
 * unset field wearing a value. batch-01 (7 distinct phases over 148 frames) and batch-02
 * (8 over 245) are real annotations and are kept. Taking the constant at face value would
 * quietly retag every top in the largest prediction batch as an address frame.
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
    const dest = path.join(work, 'ann', path.basename(path.dirname(zip)) + '-' + path.basename(zip, '.zip'));
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
    const rel = path.relative(ROOT, zip).replace(/\\/g, '/');
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
  annView: string | null;
  phase: MeasurementPhase;
  phaseSource: 'annoterad' | 'manifest';
}

function main(): void {
  const work = mkdtempSync(path.join(tmpdir(), 'across-sign-'));
  try {
    run(work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function run(work: string): void {
  // 1. The three sources.
  const predictions = batchDirs().flatMap(readPrelabel);
  const manifests = readManifests(work);
  const { perFrame: annotations, perExport, phaselessExports } = readAnnotations(work);

  // Views are unioned per SWING: the camera does not move during a swing, so one
  // annotated frame labels the whole of it.
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
  const unjoined: string[] = [];
  for (const pred of predictions) {
    const manifest = manifests.get(pred.frameId);
    const swingKey = swingOf(pred.frameId);
    if (!manifest || !swingKey) {
      unjoined.push(pred.frameId);
      continue;
    }
    const anns = annotations.get(pred.frameId) ?? [];
    const annPhase = asPhase(anns.map((a) => a.phase).find(Boolean));
    const annView = anns.map((a) => a.view).find(Boolean) ?? null;
    const manifestPhase = asPhase(manifest.phase);
    const phase = annPhase ?? manifestPhase;
    if (!phase) {
      unjoined.push(pred.frameId);
      continue;
    }
    records.push({
      frameId: pred.frameId,
      swingKey,
      pred,
      manifest,
      annPhase,
      annView,
      phase,
      phaseSource: annPhase ? 'annoterad' : 'manifest',
    });
  }

  // 3. Group into swings and run the production path over each.
  const bySwing = new Map<string, FrameRecord[]>();
  for (const r of records) {
    const list = bySwing.get(r.swingKey) ?? [];
    list.push(r);
    bySwing.set(r.swingKey, list);
  }

  const rows: Row[] = [];
  const fallback: FallbackRow[] = [];
  const bucketCount: Record<ViewBucket, number> = { dtl: 0, face_on: 0, other: 0, unknown: 0 };
  let swingsWithTop = 0;
  let swingsWithoutTopPhase = 0;
  let swingsWithoutAnyPhase = 0;

  for (const [swingKey, list] of [...bySwing].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.manifest.tSec - b.manifest.tSec);
    const bucket = viewBucket(swingViews.get(swingKey));
    bucketCount[bucket] += 1;

    const cameraAngle: CameraAngle | null = bucket === 'dtl' ? 'dtl' : null;
    const series = toSeries(swingKey, list, cameraAngle);
    const checked = checkShaftSeries(series);
    const measurements = buildShaftMeasurements(checked, { handedness: 'right' });
    const measurement = measurements.topShaftOrientation;

    // EVERY frame either labelling calls `top`, not just the one production would pick.
    // `topFrameIndex` takes the LAST `top` frame the check admitted, because a
    // measurement has to return one number; a candidate list has the opposite job, and a
    // second top frame in the same swing is a second frame someone can look at.
    const tops = list
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.annPhase === 'top' || r.manifest.phase === 'top');

    if (tops.length === 0) {
      swingsWithoutTopPhase += 1;
      // THE FALLBACK IS MEASURED, NOT USED. "Nearest the turning point" is only a top
      // when the sampling happened to catch one, and these batches sample ~4 frames per
      // swing across the whole envelope. What the nearest frame actually carries is
      // counted below and reported, because a near-vertical `address` shaft — the club
      // pointing down at the ball — would otherwise crowd the head of a table that is
      // sorted on exactly that.
      const hasAnyPhase = list.some((r) => r.annPhase !== null || asPhase(r.manifest.phase));
      if (!hasAnyPhase) swingsWithoutAnyPhase += 1;
      const index = nearestTurningPoint(list);
      if (index !== null && bucket === 'dtl') {
        const record = list[index];
        const orientation = lineOrientationDeg(record.pred.butt, record.pred.hosel);
        if (orientation !== null) {
          fallback.push({
            frameId: record.frameId,
            phase: record.phase,
            phaseSource: record.phaseSource,
            distanceTo90Deg: 90 - Math.abs(orientation),
          });
        }
      }
      continue;
    }
    swingsWithTop += 1;

    for (const { r: record, i: index } of tops) {
      const orientation = lineOrientationDeg(record.pred.butt, record.pred.hosel);
      if (orientation === null) continue;

      const quality = checked.quality.frames[index].shaftAngle;
      const chosen = measurement.value?.frameIndex === index;
      // Same arithmetic as `topShaftOrientation`, for the rows production would not pick
      // (an earlier `top` in the same swing, or one the check rejected). Written out
      // rather than reached for through a private function, and marked as off-path.
      const deviationDeg = ACROSS_THE_LINE_SIGN.right * orientation;
      const category =
        deviationDeg > ON_PLANE_BAND_DEG
          ? 'across-the-line'
          : deviationDeg < -ON_PLANE_BAND_DEG
            ? 'laid-off'
            : 'on-plane';

      rows.push({
        frameId: record.frameId,
        swingKey,
        clipName: record.manifest.clipName,
        bucket,
        annView: record.annView,
        phase: record.phase,
        phaseSource: record.phaseSource,
        manifestPhase: record.manifest.phase,
        annPhase: record.annPhase,
        selection: chosen
          ? 'produktionsvägens val'
          : quality.level === 'rejected'
            ? 'top, förkastad av kontrollen'
            : 'top, inte den sista i svingen',
        onProductionPath: chosen,
        orientationDeg: orientation,
        absFromHorizontalDeg: Math.abs(orientation),
        distanceTo90Deg: 90 - Math.abs(orientation),
        sign: Math.sign(deviationDeg) as -1 | 0 | 1,
        deviationDeg,
        category,
        directedAngleDeg: angleDeg(record.pred.butt, record.pred.hosel),
        frameLevel: quality.level,
        frameReasons: quality.reasons,
        measurementLevel: chosen ? measurement.quality.level : null,
        measurementReasons: chosen ? measurement.quality.reasons : [],
        frames: list.length,
        batchDir: record.pred.batchDir,
        annotatedShaft: (annotations.get(record.frameId) ?? []).some((a) => a.butt && a.hosel),
      });
    }
  }

  const dtl = rows.filter((r) => r.bucket === 'dtl').sort((a, b) => a.distanceTo90Deg - b.distanceTo90Deg);

  // `--blind` produces the judging round instead of the report, and deliberately leaves
  // the report and its 20 frames byte-for-byte alone: re-running the whole thing to get a
  // second artefact would rewrite the very file the round is meant to be checked against.
  if (process.argv.includes('--blind')) {
    writeBlindRound(dtl, work);
    return;
  }

  writeReport(dtl, rows, {
    predictions: predictions.length,
    joined: records.length,
    unjoined,
    swings: bySwing.size,
    bucketCount,
    phaselessExports,
    swingsWithTop,
    swingsWithoutTopPhase,
    swingsWithoutAnyPhase,
    fallback,
    perExport,
  });
  copyFrames(dtl.slice(0, TOP_N_COPIED), work);
  console.log(
    `${dtl.length} dtl-kandidater av ${rows.length} toppbildrutor · rapport: ${path.relative(ROOT, OUT_DOC)}`,
  );
}

/**
 * Frame nearest the estimated turning point, for a swing where nothing carries `top`.
 * Null when the manifest has no envelope to place the turning point in — a guess with no
 * envelope behind it would be a guess about a guess.
 */
function nearestTurningPoint(list: FrameRecord[]): number | null {
  const envelope = list.find((r) => r.manifest.envelopeSec)?.manifest.envelopeSec;
  if (!envelope) return null;
  const [start, finish] = envelope;
  if (!(finish > start)) return null;
  const target = start + TURNING_POINT_FRAC * (finish - start);
  let best = 0;
  for (let i = 1; i < list.length; i += 1) {
    if (Math.abs(list[i].manifest.tSec - target) < Math.abs(list[best].manifest.tSec - target)) best = i;
  }
  return best;
}

function toSeries(swingKey: string, list: FrameRecord[], cameraAngle: CameraAngle | null): ShaftSwingSeries {
  const frames: ShaftFrameSample[] = list.map((r) => ({
    tSec: r.manifest.tSec,
    phase: r.phase,
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
    appVersion: `across-sign-candidates/${swingKey}`,
  };
}

// ── The report ───────────────────────────────────────────────────────────────

interface Row {
  frameId: string;
  swingKey: string;
  clipName: string;
  bucket: ViewBucket;
  annView: string | null;
  phase: MeasurementPhase;
  phaseSource: 'annoterad' | 'manifest';
  manifestPhase: string;
  annPhase: MeasurementPhase | null;
  selection: 'produktionsvägens val' | 'top, förkastad av kontrollen' | 'top, inte den sista i svingen';
  onProductionPath: boolean;
  orientationDeg: number;
  absFromHorizontalDeg: number;
  distanceTo90Deg: number;
  sign: -1 | 0 | 1;
  deviationDeg: number;
  category: string;
  directedAngleDeg: number;
  frameLevel: string;
  frameReasons: readonly string[];
  measurementLevel: string | null;
  measurementReasons: readonly string[];
  frames: number;
  batchDir: string;
  annotatedShaft: boolean;
}

/** One swing that carries no `top` at all, and what the turning-point guess would have taken. */
interface FallbackRow {
  frameId: string;
  phase: MeasurementPhase;
  phaseSource: 'annoterad' | 'manifest';
  distanceTo90Deg: number;
}

interface Stats {
  predictions: number;
  joined: number;
  unjoined: string[];
  swings: number;
  bucketCount: Record<ViewBucket, number>;
  phaselessExports: Map<string, string>;
  swingsWithTop: number;
  swingsWithoutTopPhase: number;
  swingsWithoutAnyPhase: number;
  fallback: FallbackRow[];
  perExport: Map<string, number>;
}

const REFERENCE_FRAME = '049-88216ea7_s00_f05';

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

function sideLabel(row: Row): string {
  return row.orientationDeg > 0 ? '↗ höger om lodrätt' : '↖ vänster om lodrätt';
}

function confidence(row: Row): string {
  const frame = `bildruta: \`${row.frameLevel}\`${row.frameReasons.length ? ` (${row.frameReasons.join(', ')})` : ''}`;
  const measurement = row.measurementLevel
    ? `mätvärde: \`${row.measurementLevel}\`${row.measurementReasons.length ? ` (${row.measurementReasons.join(', ')})` : ''}`
    : 'mätvärde: — (utanför produktionsvägen)';
  return `${frame}<br>${measurement}`;
}

/** The hand-read verdicts for the frames that are actually in the copied set. */
function handReadTable(rows: Row[]): string {
  const lines = [
    '| # | frame-id | händighet i bilden | topp? | anmärkning |',
    '|---:|---|---|---|---|',
  ];
  for (const [i, r] of rows.entries()) {
    const seen = HAND_READ[r.frameId];
    lines.push(
      `| ${i + 1} | \`${r.frameId}\` | ${seen ? (seen.image === 'left' ? '**vänster**' : 'höger') : '— (osedd)'} | ${
        seen ? (seen.top ? 'ja' : '**nej**') : '—'
      } | ${seen?.note ?? ''} |`,
    );
  }
  return lines.join('\n');
}

/** What the discarded turning-point picks are actually labelled, phase by phase. */
function fallbackTable(rows: FallbackRow[]): string {
  const counts = new Map<string, { n: number; near: number }>();
  for (const r of rows) {
    const cell = counts.get(r.phase) ?? { n: 0, near: 0 };
    cell.n += 1;
    if (r.distanceTo90Deg <= 20) cell.near += 1;
    counts.set(r.phase, cell);
  }
  const ordered = MEASUREMENT_PHASES.filter((p) => counts.has(p));
  return [
    '| Fasen bildrutan bär | Svingar | varav inom 20° från 90° |',
    '|---|---:|---:|',
    ...ordered.map((p) => `| \`${p}\` | ${counts.get(p)!.n} | ${counts.get(p)!.near} |`),
  ].join('\n');
}

function writeReport(dtl: Row[], all: Row[], stats: Stats): void {
  const right = dtl.filter((r) => r.orientationDeg > 0);
  const left = dtl.filter((r) => r.orientationDeg < 0);
  const near = dtl.filter((r) => r.distanceTo90Deg <= 20);
  const exports = [...stats.perExport].map(([p, n]) => `\`${p}\` (${n})`).join(', ');

  // The reference frame's own standing in the table, computed rather than asserted: the
  // prose must not go stale the next time this runs on a larger set of predictions.
  const referenceSwing = REFERENCE_FRAME.replace(/_f\d+$/, '');
  const referenceRow = dtl.find((r) => r.frameId === REFERENCE_FRAME);
  const siblings = dtl.filter((r) => r.swingKey === referenceSwing && r.frameId !== REFERENCE_FRAME);
  const phaselessNote = stats.phaselessExports.size
    ? [...stats.phaselessExports]
        .map(
          ([p, v]) =>
            `> \`${p}\` bär \`phase: ${v}\` på **varje** bildruta — \`${v}\` är attributets\n> \`default_value\` i CVAT, och ett orört förval är ett osatt fält med ett värde på. Fasen\n> därifrån är kastad; vyn från samma export är kvar, för den är satt.`,
        )
        .join('\n>\n')
    : '> Varje annoterad export bär mer än ett fasvärde; ingen har kastats.';
  const referenceNote = referenceRow
    ? `Referensen \`${REFERENCE_FRAME}\` står själv i tabellen (${fmt(referenceRow.distanceTo90Deg)}° från 90°).`
    : `Just därför är referensen \`${REFERENCE_FRAME}\` **inte** med i tabellen: ingen av de två etiketterna kallar den \`top\`.` +
      (siblings.length
        ? ` Ur samma sving finns däremot ${siblings
            .map((s) => `\`${s.frameId}\` (${fmt(s.absFromHorizontalDeg)}° från horisontalen, ${fmt(s.distanceTo90Deg)}° från vikningen)`)
            .join(', ')} — samma spelare, samma kamera, annoterad \`top\`.`
        : '');

  const header = [
    '| # | frame-id | klipp | \\|vinkel\\| mot horisontalen | avstånd till 90° | sida om lodrätt | tecken | utfall | fas: annoterad / manifest | urval | konfidens |',
    '|---:|---|---|---:|---:|---|---:|---|---|---|---|',
  ];
  const line = (r: Row, i: number) =>
    `| ${i + 1} | \`${r.frameId}\`${r.frameId === REFERENCE_FRAME ? ' **← referensen**' : ''}${
      HAND_READ[r.frameId]?.image === 'left' ? ' **⚠ vänsterhänt i bilden — tecknet nedan är räknat som höger**' : ''
    } | ${r.clipName} | ${fmt(r.absFromHorizontalDeg)}° | **${fmt(r.distanceTo90Deg)}°** | ${sideLabel(r)} | ${r.sign > 0 ? '+' : r.sign < 0 ? '−' : '0'} (${fmt(r.deviationDeg)}°) | \`${r.category}\` | ${r.annPhase ? `\`${r.annPhase}\`` : '—'} / \`${r.manifestPhase}\` | ${r.selection} | ${confidence(r)} |`;

  const doc = `# Kandidater för att pröva across-the-line-tecknet nära vikningen

> Genererad av \`scripts/across-sign-candidates.ts\` — ett **engångsverktyg som bara läser**.
> Ingen produktionskod är rörd; \`derived.ts\` och \`plausibility.ts\` är oförändrade och
> serierna går genom \`checkShaftSeries\` → \`buildShaftMeasurements\` precis som i appen.
> Generera om: se körraden i verktygets huvud. Senast körd: ${new Date().toISOString().slice(0, 10)}.

## Varför

\`ACROSS_THE_LINE_SIGN\` står på **en** bedömd bildruta, \`${REFERENCE_FRAME}\`, vars skaft
ligger **77° från horisontalen — 13° från vikningen vid ±90°** som \`lineOrientationDeg\`
gör. En topp som passerar lodrätt byter tecken utan förvarning, så referensen binder
tecknet från den svagaste änden. Listan nedan är sorterad **närmast 90° först**: den
översta raden är den bildruta där en felvänd konvention skulle synas tydligast, och
kolumnen *sida om lodrätt* säger vilken av de två halvorna varje kandidat ligger i.

**Rapporten avgör ingenting.** Den plockar fram bildrutor att titta på; tecknet kan bara
prövas av ett öga som läser klubbans läge mot mållinjen.

## Källa — vad som faktiskt lästes

| Vad | Varifrån | Antal |
|---|---|---:|
| Skaftpredictions | \`data/shaft/training/batch-0*/prelabel.xml\` (modellutdata ur \`training/prelabel_batch.py\`, \`public/models/shaft-v2.onnx\`, imgsz 960, conf ≥ 0,25, keypoint ≥ 0,5) | ${stats.predictions} bildrutor |
| Tid, klipp, sving, fas, envelope | \`manifest.json\` i \`data/shaft/training/batch-0*/batch.zip\` | ${stats.joined} sammanfogade |
| \`view\`, annoterad fas | ${exports} | per sving, unionerat |

**Detta är hela predictionsunderlaget som finns på maskinen.** \`training/runs/\` är tomt,
\`training/trace-*.csv\` (bildruta-för-bildruta-spårningarna ur \`trace_swing.py\`) är
gitignorerade och finns inte här, och \`batch-01\` har ingen \`prelabel.xml\` — den
annoterades från noll. Inga nya modellkörningar gjordes: att köra detektorn på nytt hade
varit att tillverka underlaget, inte att läsa det.

### Tre saker källan inte bär, och vad verktyget gör åt dem

1. **Ingen keypoint-konfidens.** \`prelabel.xml\` bär koordinater, inte poäng. Det enda som
   är känt är gränsen körningen höll: \`butt\` och \`hosel\` ≥ **0,5**. Verktyget matar in
   just den gränsen, vilket betyder att plausibilitetens konfidenstest är **passerat per
   konstruktion** — bildrutans flagga nedan vilar på geometri och grannjämförelser, inte
   på konfidens. (Referensbildrutan hade 1,00 när den kördes i S-21; övriga är okända.)
2. **\`toe\`/\`heel\` i \`prelabel.xml\` är inte predictions.** \`sole_points()\` ritar dem
   vinkelrätt mot skaftet som ett handtag åt annotatören; shaft-v2 är en tvåpunktsmodell.
   De kastas därför, och serierna deklarerar \`keypoints: 2\` — annars hade bladvinkeln
   tillverkats ur skaftvinkeln.
3. **Ingen handedness någonstans.** Varken manifestet eller CVAT-attributen
   (\`view\`, \`blur\`, \`phase\`, \`no_shaft\`) bär den. Tabellen är räknad med
   \`handedness: 'right'\` — för en vänsterhänt spelare vänder \`ACROSS_THE_LINE_SIGN\`
   både tecken och utfall.

### Urvalet av toppbildruta

**Varje** bildruta som någon av de två fasetiketterna kallar \`top\` blir en rad — inte
bara den produktionsvägen skulle valt. \`topFrameIndex\` tar den **sista** \`top\` kontrollen
släppte igenom, för ett mätvärde måste svara med ett tal; en kandidatlista har motsatt
uppgift, och en andra topp i samma sving är en till bildruta någon kan titta på. Kolumnen
*urval* säger vilket slags rad det är, och bildrutor kontrollen **förkastade** är kvar och
märkta — det är ögat som ska bedöma dem, inte grinden.

**Ingen av de två fasetiketterna är pålitlig, så båda står i tabellen.** Manifestets fas är
härledd ur svingens envelope och ljuger ibland; annotatörens är sann där den är satt — och
i den största predictionsbatchen är den **inte satt**:

${phaselessNote}

En bildruta kommer med när **någon** av de etiketter som bär information kallar den
\`top\`. Referensbildrutan är själv exemplet på varför båda behövs: manifestet säger
\`impact\`, CVAT-attributet \`address\`, ögat \`top\`. ${referenceNote}

### Vy-filtret

\`view\` unioneras per sving över alla annotatörer, precis som i \`prelabel_batch.py\`, och
bara svingar där **varje** annoterad vy är \`dtl\` kommer med. Svingar utan annoterad vy
(\`unknown\`) räknas inte som \`dtl\`: frånvaro av evidens är inte evidens.

| Vybucket | Svingar | I tabellen |
|---|---:|---|
| \`dtl\` | ${stats.bucketCount.dtl} | ja |
| \`face_on\` (inkl. dtl/face_on-tvist) | ${stats.bucketCount.face_on} | nej — mätvärdet är inte ärligt därifrån |
| \`other\` | ${stats.bucketCount.other} | nej |
| \`unknown\` (ingen annoterad bildruta) | ${stats.bucketCount.unknown} | nej |

## Kandidater — närmast lodrätt först

${dtl.length} toppbildrutor ur ${stats.bucketCount.dtl} \`dtl\`-svingar. \`lineOrientationDeg\`
är positiv moturs på skärmen, så **positiv vinkel = klubbänden upp åt höger** i bilden och
negativ = upp åt vänster. Vikningen ligger vid ±90°, alltså lodrätt skaft.

${header.concat(dtl.map(line)).join('\n')}

## Var kandidaterna ligger

| Sida om lodrätt | Antal | Närmast 90° |
|---|---:|---|
| ↗ höger (\`lineOrientationDeg\` > 0) | **${right.length}** | ${right.length ? `\`${right[0].frameId}\` (${fmt(right[0].distanceTo90Deg)}° från 90°)` : '—'} |
| ↖ vänster (\`lineOrientationDeg\` < 0) | **${left.length}** | ${left.length ? `\`${left[0].frameId}\` (${fmt(left[0].distanceTo90Deg)}° från 90°)` : '—'} |
| Inom 20° från vikningen | ${near.length} | varav ${near.filter((r) => r.orientationDeg > 0).length} höger / ${near.filter((r) => r.orientationDeg < 0).length} vänster |

${left.length === 0
    ? '**Ingen enda kandidat ligger på andra sidan lodrätt.** Varje topp i det annoterade `dtl`-materialet lutar åt samma håll, så materialet kan inte visa vad som händer när skaftet passerar vertikalen — bara var det passerar den.'
    : `**Båda sidorna är representerade**, vilket är vad som krävs för att se om tecknet vänder vid vikningen: två toppar strax på var sida om 90° ska av ögat läsas som nästan samma klubbläge, men får motsatt \`deviationDeg\`-tecken av mätvärdet.

Fördelningen är ändå **${right.length} mot ${left.length}**, och den snedheten är i sig ett fynd: tabellen räknar varje rad som högerhänt, och en enda felbedömd händighet (eller ett spegelvänt klipp — se nedan) flyttar en rad tvärs över tabellen. Den lilla högerhögen är alltså både den intressanta och den ömtåliga.`}

## Bildrutor att titta på

De ${Math.min(TOP_N_COPIED, dtl.length)} översta är kopierade till
[\`across-sign-candidates/\`](across-sign-candidates/), numrerade i tabellens ordning.
Katalogen är **gitignorerad** — bilderna föreställer identifierbara personer och
\`data/shaft/*\` är ignorerat av just det skälet; kopiorna får inte gå en annan väg in i
repot än originalen.

### Ögats genomgång av dem

Alla ${Object.keys(HAND_READ).length} är sedda (2026-09-17). Kolumnen *händighet i bilden*
är vad bildrutan **visar**, vilket är det mätvärdet ser — inte ett påstående om spelaren.

${handReadTable(dtl.slice(0, TOP_N_COPIED))}

**Tre saker den genomgången ger, som ingen kolumn ovanför kan ge:**

1. **Bildruta ${dtl.findIndex((r) => r.frameId === '093-2c11c3c0_s00_f02') + 1 || '—'},
   \`093-2c11c3c0_s00_f02\`, är spegelvänd.** Rangeskyltarna i bakgrunden läser \`TIH\` och
   \`ƎM\`, distansmarkeringen \`00Ɛ\` — klippet är inspelat med spegelvänd kamera. Svingen
   är en **högerhänts**, men i bilden är den en vänsterhänts, och det är bilden detektorn
   och mätvärdet arbetar i. Raden står i tabellen som \`across-the-line\` räknad på
   \`handedness: 'right'\`; med bildens händighet blir den \`laid-off\` — samma bildruta,
   motsatt svar. **Ingenting i datamodellen bär vare sig händighet eller spegling**, så
   den här inversionen är osynlig hela vägen upp.
2. **Alla övriga 19 är högerhänta i bilden.** Ingen bekräftat vänsterhänt spelare finns
   bland dem, och eftersom fältet inte finns går det inte att söka efter en heller — bara
   att titta. Den vänsterhänta halvan av \`ACROSS_THE_LINE_SIGN\` är fortfarande enbart
   en spegling per konstruktion.
3. **En bildruta är inte en topp.** \`img-4982-23afcab9_s00_f02\` är en genomsving;
   manifestets \`top\` är fel där och annotatörens \`finish\` rätt. Den enda etiketten som
   inte ljög på någon av de 20 är den mänskliga, där den var satt.

## Vändpunktsfallbacken — mätt, och därför inte använd

${stats.swingsWithoutTopPhase} av ${stats.swings} svingar med predictions bär **ingen**
\`top\`-bildruta: batcherna drar ~4 bildrutor ur hela svingen, och toppen hamnar oftast
inte bland dem. \`${stats.swingsWithoutAnyPhase}\` sving saknar fas helt — det är först där
frågans fallback ("närmaste bildruta till vändpunkten") har något att göra.

Att ändå ta den tidsmässigt närmaste bildrutan till en skattad vändpunkt
(${fmt(TURNING_POINT_FRAC * 100, 1)} % in i \`envelopeSec\`, ur typsvingens proportioner i
\`src/lib/dataset/datasetPhase.ts\` → \`FALLBACK_BOUNDS\`) ger **inte** toppar. Så här ser
de ${stats.fallback.length} \`dtl\`-svingarna ut, efter vad bildrutan faktiskt är märkt som:

${fallbackTable(stats.fallback)}

**Och de hade tagit över tabellen.** ${stats.fallback.filter((f) => f.distanceTo90Deg <= 20).length}
av dem ligger inom 20° från vikningen — en \`address\`-bildruta har skaftet nära lodrätt
därför att klubban pekar ner mot bollen, vilket inte har något med en topp att göra.
Sorteringen på avstånd till 90° hade lyft dem högst upp. Raderna är därför räknade här och
utelämnade ur kandidatlistan.

## Alla toppbildrutor, inte bara dtl

${all.length} toppbildrutor ur ${stats.swingsWithTop} svingar som bär en \`top\`-fas, av
${stats.swings} svingar med predictions totalt.${stats.unjoined.length ? ` ${stats.unjoined.length} prediction(er) gick inte att foga till ett manifest eller en fas och utelämnades.` : ''}
`;

  mkdirSync(path.dirname(OUT_DOC), { recursive: true });
  writeFileSync(OUT_DOC, doc, 'utf8');
}

// ── The blind round (`--blind`) ──────────────────────────────────────────────

const OUT_BLIND = path.join(ROOT, 'docs', 'shaft', 'across-sign-blind.md');
const OUT_BLIND_KEY = path.join(ROOT, 'docs', 'shaft', 'across-sign-blind-key.md');
const OUT_BLIND_FRAMES = path.join(ROOT, 'docs', 'shaft', 'across-sign-blind');

/** Shuffle seed. Printed in both files so the order can be reproduced, never inferred. */
const BLIND_SEED = 0x5ca1ab1e;

/** How many of the left-of-vertical candidates to take, nearest the fold first. */
const BLIND_LEFT_COUNT = 7;

/**
 * CLIPS kept out of the round, with the reason — clips, not frames, and that is the point.
 *
 * `093-2c11c3c0_s00_f02` is the frame the mirroring was found in, but a mirrored camera is
 * a property of the recording: `093-2c11c3c0_s01_f01` is another swing out of the same clip
 * and is just as flipped. Excluding only the named frame would have left its twin in the
 * round, carrying the one inversion the round is not testing for.
 */
const BLIND_EXCLUDED_CLIPS: Record<string, string> = {
  '093-2c11c3c0': 'spegelvänd inspelning — hanteras separat',
};

/** The clip part of a frame id: everything before `_sNN`. */
function clipKeyOf(frameId: string): string {
  return frameId.replace(/_s\d+_f\d+$/, '');
}

function blindExclusion(frameId: string): string | undefined {
  return BLIND_EXCLUDED_CLIPS[clipKeyOf(frameId)];
}

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

/**
 * The judging round: one file to judge from, one to check against afterwards.
 *
 * WHAT THE BLIND FILE MAY NOT CONTAIN, and why each one is a leak: the shaft angle and the
 * distance to 90° (the answer, in degrees); the side of vertical (the answer, as a
 * direction); the computed sign or category (the answer, in words); the table order from
 * the report (sorted on distance to the fold, so position is the answer); how many frames
 * came from each side (a count that turns 13 judgements into 13 guesses with a known sum);
 * and the file name of the key. The frames are copied under plain `<frame-id>.jpg` for the
 * same reason — a rank prefix would carry the sort order into the file listing.
 */
function writeBlindRound(dtl: Row[], work: string): void {
  const right = dtl.filter((r) => r.orientationDeg > 0 && !blindExclusion(r.frameId));
  const left = dtl
    .filter((r) => r.orientationDeg < 0 && !blindExclusion(r.frameId))
    .slice(0, BLIND_LEFT_COUNT);
  const selected = [...right, ...left];
  const excluded = dtl.filter((r) => blindExclusion(r.frameId));

  const order = shuffle(selected, rng(BLIND_SEED));
  const seedHex = `0x${BLIND_SEED.toString(16)}`;
  const today = new Date().toISOString().slice(0, 10);

  copyBlindFrames(order, work);

  const blind = `# Blind bedömningsomgång — skaftet vid toppen

> ${order.length} bildrutor att bedöma för hand. Ordningen är slumpad med fast frö
> **\`${seedHex}\`** (mulberry32 + Fisher-Yates i \`scripts/across-sign-candidates.ts --blind\`)
> och **bär ingen information** — varken radnumret, filnamnet eller grannraderna säger något
> om svaret. Genererad ${today}.

## Vad som ska fyllas i

För varje bildruta: står skaftet **across the line** eller **laid off** vid toppen, sett
bakifrån mot mållinjen?

- \`across\` — klubban pekar höger om mållinjen (för en högerhänt spelare sett bakifrån)
- \`laid-off\` — klubban pekar vänster om mållinjen
- \`kan inte avgöra\` — bildrutan är ingen topp, vyn räcker inte, eller läget är för nära
  mållinjen för att kalla åt något håll

Skriv svaret i sista kolumnen. **Läs ingenting annat i \`docs/shaft/\` förrän alla rader är
ifyllda** — resten av mappen innehåller det uträknade svaret.

| # | frame-id | bild | ditt svar |
|---:|---|---|---|
${order
  .map(
    (r, i) =>
      `| ${i + 1} | \`${r.frameId}\` | [\`${path.basename(OUT_BLIND_FRAMES)}/${r.frameId}.jpg\`](${path.basename(OUT_BLIND_FRAMES)}/${r.frameId}.jpg) |  |`,
  )
  .join('\n')}
`;

  const key = `# Facit till den blinda omgången

> **Öppna inte förrän [across-sign-blind.md](across-sign-blind.md) är ifylld.**
> Genererad ${today} av \`scripts/across-sign-candidates.ts --blind\`, samma körning som den
> blinda filen. Frö: \`${seedHex}\`.

## Urvalet

Ur kandidattabellen i [across-sign-candidates.md](across-sign-candidates.md): **alla
${right.length + excluded.length} kandidater höger om lodrätt** och de **${left.length}
närmast vikningen till vänster**.
${
  excluded.length
    ? `Undantagna: ${excluded
        .map((r) => `\`${r.frameId}\``)
        .join(', ')} — hela klippet \`${[...new Set(excluded.map((r) => clipKeyOf(r.frameId)))].join('`, `')}\` (${[...new Set(excluded.map((r) => blindExclusion(r.frameId)))].join('; ')}). Därav ${right.length} + ${left.length} = **${selected.length}** rader.`
    : `Totalt **${selected.length}** rader.`
}
Alla är \`dtl\`, alla bär fasen \`top\` från minst en etikett, och alla är räknade med
\`handedness: 'right'\` — det är antagandet i hela tabellen, inte ett påstående om spelaren.

**Varje bildruta i omgången är kontrollerad mot spegling** (bakgrundstext och vilken sida
bollen ligger på) innan den släpptes in, eftersom en spegelvänd bild vänder tecknet utan att
något i datamodellen märker det. Bara klippet nedan var spegelvänt; ingen annan bildruta i
listan bär vänsterhänt geometri. Kontrollen säger ingenting om *utfallet* — den är gjord på
bakgrunden, inte på klubban.

**Vad omgången kan visa.** Stämmer ögat och \`ACROSS_THE_LINE_SIGN\` överens på båda sidor om
lodrätt, är tecknet prövat på mer än den enda bildruta S-21 vilade på. Går de isär
**systematiskt på den ena sidan**, ligger felet i vikningen vid ±90° och inte i tecknet.
Enstaka \`kan inte avgöra\` säger i sig ingenting om tecknet — de säger att bildrutan inte
var en topp.

| # i blinda listan | frame-id | sida om lodrätt | \\|vinkel\\| mot horisontalen | avstånd till 90° | beräknat tecken | beräknat utfall | flagga |
|---:|---|---|---:|---:|---:|---|---|
${order
  .map(
    (r, i) =>
      `| ${i + 1} | \`${r.frameId}\` | ${sideLabel(r)} | ${fmt(r.absFromHorizontalDeg)}° | ${fmt(r.distanceTo90Deg)}° | ${r.sign > 0 ? '+' : '−'} (${fmt(r.deviationDeg)}°) | \`${r.category}\` | \`${r.frameLevel}\`${r.frameReasons.length ? ` (${r.frameReasons.join(', ')})` : ''} |`,
  )
  .join('\n')}

## Det uteslutna fallet

${
  excluded.length
    ? excluded
        .map(
          (r) =>
            `\`${r.frameId}\`: ${fmt(r.absFromHorizontalDeg)}° från horisontalen, ${fmt(r.distanceTo90Deg)}° från vikningen, ${sideLabel(r)}, beräknat \`${r.category}\`. ${HAND_READ[r.frameId]?.note ?? blindExclusion(r.frameId)}. Bedöm dem för sig: speglar man tillbaka bilden byter både händigheten och utfallet plats, och det är två fel som tar ut varandra bara om båda görs.`,
        )
        .join('\n\n')
    : 'Inga.'
}
`;

  writeFileSync(OUT_BLIND, blind, 'utf8');
  writeFileSync(OUT_BLIND_KEY, key, 'utf8');
  console.log(
    `blind omgång: ${order.length} bildrutor (frö ${seedHex}) · ${path.relative(ROOT, OUT_BLIND)} · facit: ${path.relative(ROOT, OUT_BLIND_KEY)}`,
  );
}

/** Blind frames keep their own plain names — no rank, no ordering, no hint. */
function copyBlindFrames(rows: Row[], work: string): void {
  rmSync(OUT_BLIND_FRAMES, { recursive: true, force: true });
  mkdirSync(OUT_BLIND_FRAMES, { recursive: true });
  const staging = path.join(work, 'blind');
  for (const row of rows) {
    unzip(path.join(row.batchDir, 'batch.zip'), staging, `frames/${row.frameId}.jpg`);
    copyFileSync(
      path.join(staging, 'frames', `${row.frameId}.jpg`),
      path.join(OUT_BLIND_FRAMES, `${row.frameId}.jpg`),
    );
  }
}

function copyFrames(rows: Row[], work: string): void {
  // Old copies go first: the numbering is the table's, so a frame that moved rank would
  // otherwise linger under its previous number and no longer match the report.
  rmSync(OUT_FRAMES, { recursive: true, force: true });
  mkdirSync(OUT_FRAMES, { recursive: true });
  const staging = path.join(work, 'frames');
  for (const [i, row] of rows.entries()) {
    unzip(path.join(row.batchDir, 'batch.zip'), staging, `frames/${row.frameId}.jpg`);
    const rank = String(i + 1).padStart(2, '0');
    copyFileSync(
      path.join(staging, 'frames', `${row.frameId}.jpg`),
      path.join(OUT_FRAMES, `${rank}-${row.frameId}.jpg`),
    );
  }
}

main();
