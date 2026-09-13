#!/usr/bin/env node
// Reconcile annotated phase values from a CVAT COCO export against the derived
// values in the batch manifest. Writes an authoritative lookup table and prints a
// crosstable of derived → annotated so the direction of derivation errors is visible.
//
// WHY THIS EXISTS. Batch-01 showed ~50 % disagreement between the extractor's derived
// phase and manual annotation. The annotated value is now authoritative
// (docs/shaft/annotation-spec.md → *`phase` sätts av annotatören*). This script
// produces phase-corrected.json — a map {frameId → {derived, annotated, changed}} —
// that training pipelines use in place of manifest.json's `phase`. The crosstable is
// the deliverable: it shows whether derivation errors are systematic (e.g. consistently
// too late in the swing) or random.
//
// HOW PHASE IS READ FROM THE EXPORT. CVAT COCO exports include custom attributes on
// each annotation in an `attributes` field. This script looks for the phase value in:
//   1. `frame_meta` tag annotations (the pre-filled tag, highest priority)
//   2. `shaft` skeleton annotations (the mutable phase attribute on the skeleton)
// The first non-empty value found is used.
//
// Usage:
//   node scripts/reconcile-phase.mjs
//   node scripts/reconcile-phase.mjs \
//     --export data/shaft/training/batch-01/annotated-v1.zip \
//     --batch  data/shaft/training/batch-01/batch.zip \
//     --out    data/shaft/training/batch-01/phase-corrected.json
//   node scripts/reconcile-phase.mjs --dry-run

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { openZip, readEntry } from './build-calibration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE_ROOT = path.join(ROOT, 'data', 'shaft');

const DEFAULT_EXPORT = path.join(WRITE_ROOT, 'training', 'batch-01', 'annotated-v1.zip');
const DEFAULT_BATCH = path.join(WRITE_ROOT, 'training', 'batch-01', 'batch.zip');
const DEFAULT_OUT = path.join(WRITE_ROOT, 'training', 'batch-01', 'phase-corrected.json');

const COCO_ENTRY = 'annotations/person_keypoints_default.json';
const MANIFEST_ENTRY = 'manifest.json';

/** Category names to read phase from, in priority order. */
const PHASE_CATEGORIES = ['frame_meta', 'shaft'];

/** Display order for crosstable rows and columns. */
export const PHASES = ['idle', 'address', 'backswing', 'top', 'downswing', 'impact', 'through', 'finish'];

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function frameIdFromPath(filePath) {
  return path.posix.basename(String(filePath).replace(/\\/g, '/')).replace(/\.jpe?g$/i, '');
}

/**
 * Read annotated phases from a CVAT COCO export ZIP.
 *
 * Looks for `phase` in `attributes` on frame_meta tag annotations first, then shaft
 * skeleton annotations. Returns a Map<frameId, phase>.
 *
 * @param {string} exportFile path to the COCO export ZIP
 * @returns {Map<string, string>}
 */
export function readAnnotatedPhases(exportFile) {
  const zip = openZip(exportFile);
  const raw = readEntry(zip, COCO_ENTRY);
  const coco = JSON.parse(raw.toString('utf8'));

  const imagesById = new Map((coco.images ?? []).map((img) => [img.id, img]));

  // phase per frame id — filled in priority order, first writer wins
  const phaseByFrame = new Map();

  for (const catName of PHASE_CATEGORIES) {
    const cat = (coco.categories ?? []).find((c) => c.name === catName);
    if (!cat) continue;

    for (const ann of coco.annotations ?? []) {
      if (ann.category_id !== cat.id) continue;
      const image = imagesById.get(ann.image_id);
      if (!image) continue;
      const id = frameIdFromPath(image.file_name);
      if (phaseByFrame.has(id)) continue; // higher-priority category already set it
      const phase = ann.attributes?.phase;
      if (phase && typeof phase === 'string' && phase.trim()) {
        phaseByFrame.set(id, phase.trim());
      }
    }
  }

  return phaseByFrame;
}

/**
 * Read derived phases from a batch ZIP's manifest.json.
 *
 * @param {string} batchFile path to batch.zip
 * @returns {Map<string, string>}
 */
export function readDerivedPhases(batchFile) {
  const zip = openZip(batchFile);
  const raw = readEntry(zip, MANIFEST_ENTRY);
  const manifest = JSON.parse(raw.toString('utf8'));
  const phaseByFrame = new Map();
  for (const frame of manifest.frames ?? []) {
    if (frame.id && frame.phase) phaseByFrame.set(frame.id, frame.phase);
  }
  return phaseByFrame;
}

/**
 * Read full manifest frame records from a batch ZIP.
 *
 * Returns a Map<frameId, manifestFrame> so callers can access any per-frame field
 * (e.g. `hasConfidentImpact`) beyond what `readDerivedPhases` exposes.
 *
 * @param {string} batchFile path to batch.zip
 * @returns {Map<string, object>}
 */
export function readManifestFrames(batchFile) {
  const zip = openZip(batchFile);
  const raw = readEntry(zip, MANIFEST_ENTRY);
  const manifest = JSON.parse(raw.toString('utf8'));
  const frameMap = new Map();
  for (const frame of manifest.frames ?? []) {
    if (frame.id) frameMap.set(frame.id, frame);
  }
  return frameMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation — pure, testable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge annotated and derived phase maps into a reconciliation result.
 *
 * Frames with no annotated value are skipped (can't use as truth). Frames only in
 * the manifest (not annotated) get `annotated: null` and are included for coverage.
 *
 * @param {Map<string, string>} annotated
 * @param {Map<string, string>} derived
 * @returns {{ frames: Record<string, object>, changed: number, total: number, crosstable: Record<string, Record<string, number>>, onlyInBatch: string[] }}
 */
export function reconcile(annotated, derived) {
  const frames = {};
  let changed = 0;
  const crosstable = {};
  const onlyInBatch = [];

  // Frames with an annotated value — these are the authoritative ones
  for (const [id, ann] of annotated) {
    const drv = derived.get(id) ?? null;
    const didChange = ann !== drv;
    if (didChange) changed++;
    frames[id] = { derived: drv, annotated: ann, changed: didChange };

    const dKey = drv ?? '(missing)';
    if (!crosstable[dKey]) crosstable[dKey] = {};
    crosstable[dKey][ann] = (crosstable[dKey][ann] ?? 0) + 1;
  }

  // Frames in the batch but not in the export — note them for completeness
  for (const id of derived.keys()) {
    if (!annotated.has(id)) onlyInBatch.push(id);
  }

  return { frames, changed, total: Object.keys(frames).length, crosstable, onlyInBatch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a crosstable from a subset of reconciled frames.
 *
 * @param {Record<string, {derived: string|null, annotated: string, changed: boolean}>} frames
 * @param {Iterable<string>} ids subset of frame ids to include
 * @returns {{ crosstable: Record<string, Record<string, number>>, changed: number, total: number }}
 */
export function buildCrosstable(frames, ids) {
  const crosstable = {};
  let changed = 0;
  let total = 0;
  for (const id of ids) {
    const f = frames[id];
    if (!f) continue;
    total++;
    if (f.changed) changed++;
    const dKey = f.derived ?? '(missing)';
    if (!crosstable[dKey]) crosstable[dKey] = {};
    crosstable[dKey][f.annotated] = (crosstable[dKey][f.annotated] ?? 0) + 1;
  }
  return { crosstable, changed, total };
}

// Consistent phase sort: PHASES order first, then lexicographic for unknowns.
function phaseOrder(phases) {
  return [...phases].sort((a, b) => {
    const ia = PHASES.indexOf(a);
    const ib = PHASES.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function printCrosstable(label, crosstable, changed, total) {
  const pct = total > 0 ? ((changed / total) * 100).toFixed(1) : '0.0';
  console.log(`\n${label}`);
  console.log(`Felfrekvens: ${changed} av ${total} (${pct} %)`);

  if (total === 0) {
    console.log('(inga frames i denna grupp)');
    return;
  }

  const derivedPhases = phaseOrder(Object.keys(crosstable));
  const annotatedPhases = phaseOrder([...new Set(Object.values(crosstable).flatMap(Object.keys))]);

  const C = 13; // column width
  const pad = (s) => String(s).padEnd(C);
  const lpad = (s) => String(s).padStart(C);

  const header = pad('härlett\\ann') + annotatedPhases.map(lpad).join('') + lpad('Σ');
  console.log(header);
  console.log('─'.repeat(header.length));

  for (const d of derivedPhases) {
    const row = crosstable[d];
    const rowTotal = Object.values(row).reduce((a, b) => a + b, 0);
    console.log(pad(d) + annotatedPhases.map((p) => lpad(row[p] ?? 0)).join('') + lpad(rowTotal));
  }

  const colTotals = {};
  for (const row of Object.values(crosstable)) {
    for (const [p, n] of Object.entries(row)) colTotals[p] = (colTotals[p] ?? 0) + n;
  }
  const grandTotal = Object.values(colTotals).reduce((a, b) => a + b, 0);
  console.log('─'.repeat(header.length));
  console.log(pad('Σ') + annotatedPhases.map((p) => lpad(colTotals[p] ?? 0)).join('') + lpad(grandTotal));
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O guard
// ─────────────────────────────────────────────────────────────────────────────

function guardWrite(file, data) {
  const abs = path.resolve(file);
  if (!abs.startsWith(WRITE_ROOT + path.sep) && abs !== WRITE_ROOT) {
    throw new Error(`WRITE GUARD: refusing to write outside ${WRITE_ROOT}: ${file}`);
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, data);
  return abs;
}

function rel(file) {
  return path.relative(ROOT, file);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    exportFile: DEFAULT_EXPORT,
    batchFile: DEFAULT_BATCH,
    out: DEFAULT_OUT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--export') opts.exportFile = path.resolve(argv[++i]);
    else if (argv[i] === '--batch') opts.batchFile = path.resolve(argv[++i]);
    else if (argv[i] === '--out') opts.out = path.resolve(argv[++i]);
    else if (argv[i] === '--dry-run') opts.dryRun = true;
    else {
      console.error(`Okänt argument: ${argv[i]}`);
      process.exitCode = 1;
    }
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);

  console.log(`Export: ${rel(opts.exportFile)}`);
  console.log(`Batch:  ${rel(opts.batchFile)}`);
  console.log(`Out:    ${rel(opts.out)}`);

  const annotated = readAnnotatedPhases(opts.exportFile);
  const derived = readDerivedPhases(opts.batchFile);
  const manifestFrames = readManifestFrames(opts.batchFile);

  console.log(`\nAnnoterade frames ur export: ${annotated.size}`);
  console.log(`Frames i batchmanifest:       ${derived.size}`);

  const result = reconcile(annotated, derived);

  const pct = (n, tot) => (tot > 0 ? ((n / tot) * 100).toFixed(1) : '0.0') + ' %';
  console.log(`\nMatchade frames: ${result.total}`);
  console.log(`Ändrade:         ${result.changed} av ${result.total} (${pct(result.changed, result.total)})`);
  if (result.onlyInBatch.length > 0) {
    console.log(`Ej annoterade:   ${result.onlyInBatch.length} frames finns i batch men saknar annotering`);
  }

  // Split reconciled frame ids by hasConfidentImpact from the manifest.
  const withImpact = [];
  const noImpact = [];
  for (const id of Object.keys(result.frames)) {
    const mf = manifestFrames.get(id);
    if (mf?.hasConfidentImpact) withImpact.push(id);
    else noImpact.push(id);
  }

  // Three crosstables: totalt, hasConfidentImpact=true, hasConfidentImpact=false.
  const total = buildCrosstable(result.frames, Object.keys(result.frames));
  const withImpactCt = buildCrosstable(result.frames, withImpact);
  const noImpactCt = buildCrosstable(result.frames, noImpact);

  printCrosstable('Korstabell: härlett → annoterat (totalt)', total.crosstable, total.changed, total.total);
  printCrosstable('Korstabell: hasConfidentImpact = true', withImpactCt.crosstable, withImpactCt.changed, withImpactCt.total);
  printCrosstable('Korstabell: hasConfidentImpact = false', noImpactCt.crosstable, noImpactCt.changed, noImpactCt.total);

  if (opts.dryRun) {
    console.log('\n--dry-run: inget skrivet.');
    return;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    exportFile: rel(opts.exportFile),
    batchFile: rel(opts.batchFile),
    changed: result.changed,
    total: result.total,
    frames: result.frames,
  };
  guardWrite(opts.out, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nSkrev: ${rel(opts.out)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
