#!/usr/bin/env node
// Draw the fixed, reproducible CALIBRATION SET out of the exported dataset ZIPs.
//
// WHAT THIS IS FOR. The 100 frames drawn here are annotated INDEPENDENTLY by both
// annotators before production annotation starts, to measure agreement (target:
// median deviation < 0.5 shaft widths — docs/shaft/annotation-spec.md). Afterwards
// the same 100 frames become the permanent eval set, which is why `reserved-ids.txt`
// exists: a frame that has been measured on may never appear in training data, or
// every number the eval set produces is a memorisation score.
//
// WHY DETERMINISTIC. The set has to be re-derivable — a year from now, from the same
// exports, this script must produce the same 100 ids, or the eval set is not the eval
// set any more. So: the pool is sorted by `id` (stable and derived, never random —
// see `frameId` in src/lib/dataset/datasetTypes.ts), the shuffle is a seeded PRNG with
// the constant below, and nothing time- or filesystem-order-dependent enters the
// selection. Adding a new export changes the draw; that is expected and is exactly why
// the output is committed to `data/shaft/calibration/` as an artefact rather than
// regenerated on demand.
//
// NO NEW DEPENDENCIES. ZIP reading is central-directory parsing plus
// `zlib.inflateRawSync`; ZIP writing is the store-method writer from
// `src/lib/dataset/zip.ts` restated for Node Buffers. Neither is worth a package.
//
// Usage:
//   node scripts/build-calibration-set.mjs
//   node scripts/build-calibration-set.mjs --exports data/shaft/exports --out data/shaft/calibration
//   node scripts/build-calibration-set.mjs --dry-run    # pool + draw, writes nothing

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { inflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The only directory this script may write into. Enforced in `assertInsideDataShaft`. */
const WRITE_ROOT = path.join(ROOT, 'data', 'shaft');

const DEFAULT_EXPORTS_DIR = path.join(WRITE_ROOT, 'exports');
const DEFAULT_OUT_DIR = path.join(WRITE_ROOT, 'calibration');

/**
 * SELECTION SEED — a constant, never a CLI flag and never time-derived.
 *
 * Changing it re-draws the whole calibration set. Do not, once annotation has begun:
 * the reserved ids would change, and frames annotated as eval would silently become
 * eligible for training.
 */
export const SELECTION_SEED = 0x5caff01d;

/** Frames in the calibration set. The spec's number; the quotas below sum to it. */
export const CALIBRATION_SIZE = 100;

/**
 * PER-PHASE COUNTS, weighted towards downswing — for the calibration set only.
 *
 * These are NOT `PHASE_TARGET_WEIGHTS` (src/lib/dataset/phaseQuota.ts); they are a
 * separate distribution chosen for the calibration set. The training set is drawn from
 * spec-compliant quotas instead. This set's heavier downswing weight (40 % vs. 34 % in
 * the spec) is intentional: downswing is the hardest phase to detect and bears the model's
 * value. A harder eval set makes the metric conservative—the right direction. See
 * docs/oppna-fragor.md, B4, for the rationale and why the difference is preserved.
 * The calibration set is drawn once, annotated, and then frozen as the permanent eval set.
 */
export const PHASE_QUOTAS = {
  downswing: 40,
  impact: 15,
  top: 12,
  backswing: 12,
  through: 9,
  address: 7,
  finish: 5,
};

/**
 * Fill order. Descending quota, so the phases that dominate the set claim the frames
 * with unused swings first — a shortfall lands on a light phase, where it costs least.
 * Fixed, because the order is part of what makes the draw reproducible.
 */
export const PHASE_ORDER = ['downswing', 'impact', 'top', 'backswing', 'through', 'address', 'finish'];

/** Where a phase's shortfall is made up from (the spec names downswing explicitly). */
const FILL_PHASE = 'downswing';

/** The two `source` values a frame can carry; the draw aims at an even split. */
const SOURCES = ['web', 'own'];

// ─────────────────────────────────────────────────────────────────────────────
// Selection — pure, deterministic, unit-tested (build-calibration-set.test.mjs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw the calibration set from a pool of frame-metadata objects.
 *
 * Deterministic: the pool is sorted by `id` and shuffled with a PRNG seeded from
 * `seed`, so the same pool always yields the same set regardless of the order the
 * ZIPs happened to be read in.
 *
 * SPREAD ACROSS SWINGS. Two frames from the same swing are nearly the same picture —
 * on an agreement measurement they buy a fraction of what two frames from different
 * swings buy. So a candidate whose swing is already represented is only taken when
 * the phase cannot be filled otherwise (`maxPerSwing`, default 1).
 *
 * SOURCE BALANCE. `web` (Reddit) and `own` clips differ in camera, framing and
 * compression; a calibration number drawn from one of them says little about the
 * other. The draw prefers whichever source is currently behind, softly — preference
 * never blocks a pick, it only orders the candidates.
 *
 * @param {Array<object>} pool frame metadata, `id`/`phase`/`source`/`clipName`/`swingIndex`
 * @param {{size?: number, quotas?: Record<string, number>, seed?: number, maxPerSwing?: number}} [opts]
 * @returns {{frames: Array<object>, byPhase: Record<string, number>, bySource: Record<string, number>,
 *            shortfallByPhase: Record<string, number>, filledFromDownswing: number,
 *            filledFromAnyPhase: number, swingCount: number, maxFramesPerSwing: number}}
 */
export function selectCalibrationSet(pool, opts = {}) {
  const {
    size = CALIBRATION_SIZE,
    quotas = PHASE_QUOTAS,
    seed = SELECTION_SEED,
    maxPerSwing = 1,
  } = opts;

  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shuffled = shuffle(sorted, mulberry32(seed));

  const candidates = new Map(); // phase → frames, in shuffled order
  for (const f of shuffled) {
    const list = candidates.get(f.phase);
    if (list) list.push(f);
    else candidates.set(f.phase, [f]);
  }

  const state = {
    picked: [],
    pickedIds: new Set(),
    perSwing: new Map(),
    bySource: Object.fromEntries(SOURCES.map((s) => [s, 0])),
    maxPerSwing,
  };

  const shortfallByPhase = {};
  for (const phase of PHASE_ORDER) {
    const want = quotas[phase] ?? 0;
    const got = drawInto(state, candidates.get(phase) ?? [], want);
    shortfallByPhase[phase] = want - got;
  }

  // A phase that ran dry does not shrink the set — the deficit is made up from
  // downswing, per the spec. Only if downswing is exhausted too does the draw fall
  // back to whatever is left anywhere; that path is reported in summary.md rather
  // than hidden, because it means the pool is too small for a 100-frame set.
  const filledFromDownswing = drawInto(state, candidates.get(FILL_PHASE) ?? [], size - state.picked.length);
  let filledFromAnyPhase = 0;
  for (const phase of PHASE_ORDER) {
    if (state.picked.length >= size) break;
    if (phase === FILL_PHASE) continue;
    filledFromAnyPhase += drawInto(state, candidates.get(phase) ?? [], size - state.picked.length);
  }

  const frames = [...state.picked].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    frames,
    byPhase: tally(frames, (f) => f.phase),
    bySource: tally(frames, (f) => f.source),
    shortfallByPhase,
    filledFromDownswing,
    filledFromAnyPhase,
    swingCount: new Set(frames.map(swingKey)).size,
    maxFramesPerSwing: Math.max(0, ...Object.values(tally(frames, swingKey))),
  };
}

/**
 * Take up to `want` frames from `candidates` into `state`, best-first.
 *
 * Each pick walks a per-swing allowance upwards from `maxPerSwing`, and at every
 * level prefers the source that is behind: a frame from an unused swing and the
 * lagging source, else any frame from an unused swing, else the same two questions
 * with one more frame per swing allowed, and so on.
 *
 * THE ALLOWANCE ESCALATES INSTEAD OF BEING ABANDONED. When the pool holds fewer
 * swings than the set needs frames, the cap cannot hold — but dropping it entirely
 * at that point would let the draw stack six frames on whichever swing happens to
 * come first in shuffle order. Raising it a step at a time keeps the set spread as
 * thinly over the available swings as the pool permits.
 *
 * @returns {number} how many were actually taken
 */
function drawInto(state, candidates, want) {
  let taken = 0;
  for (let n = 0; n < want; n++) {
    const free = candidates.filter((f) => !state.pickedIds.has(f.id));
    if (free.length === 0) break; // candidates exhausted
    const behind = laggingSource(state.bySource);

    let chosen = null;
    for (let allowance = state.maxPerSwing; !chosen; allowance++) {
      const room = (f) => (state.perSwing.get(swingKey(f)) ?? 0) < allowance;
      chosen = free.find((f) => room(f) && f.source === behind) ?? free.find(room) ?? null;
    }

    state.picked.push(chosen);
    state.pickedIds.add(chosen.id);
    const key = swingKey(chosen);
    state.perSwing.set(key, (state.perSwing.get(key) ?? 0) + 1);
    if (chosen.source in state.bySource) state.bySource[chosen.source]++;
    taken++;
  }
  return taken;
}

/** Whichever source is currently under-represented; ties go to the first listed. */
function laggingSource(bySource) {
  return SOURCES.reduce((a, b) => (bySource[b] < bySource[a] ? b : a));
}

/**
 * Swing identity: the clip plus the swing index within it. Frames of one swing are
 * near-duplicates for annotation purposes, and this is what "max 1 per swing" counts.
 */
export function swingKey(frame) {
  return `${frame.clipName}#${frame.swingIndex}`;
}

/** mulberry32 — 32-bit seeded PRNG. Small, well-distributed, and exactly reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, consuming `rand` in a fixed order. */
function shuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tally(items, keyOf) {
  const out = {};
  for (const item of items) {
    const k = keyOf(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP reading — central directory + inflateRaw. Store and deflate only.
// ─────────────────────────────────────────────────────────────────────────────

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/**
 * Index a ZIP's central directory.
 *
 * Reads the whole file into memory — the exports are hundreds of MB, which is fine,
 * and streaming would buy nothing since the draw needs every manifest before it can
 * pick a single frame.
 *
 * @returns {{buf: Buffer, entries: Map<string, {offset: number, method: number, compSize: number, size: number}>}}
 */
export function openZip(file) {
  try {
    return openZipBuffer(readFileSync(file));
  } catch (err) {
    throw new Error(`${path.basename(file)}: ${err instanceof Error ? err.message : err}`);
  }
}

/** As `openZip`, but over bytes already in hand. */
export function openZipBuffer(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (pos === 0xffffffff || count === 0xffff) {
    throw new Error('ZIP64 archive — this reader does not support it');
  }

  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== SIG_CENTRAL) {
      throw new Error(`corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    entries.set(name, { offset: localOffset, method, compSize, size });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { buf, entries };
}

/** Decompress one entry out of an opened ZIP. */
export function readEntry(zip, name) {
  const entry = zip.entries.get(name);
  if (!entry) throw new Error(`entry not found in archive: ${name}`);
  const { buf } = zip;
  if (buf.readUInt32LE(entry.offset) !== SIG_LOCAL) {
    throw new Error(`corrupt local header for ${name}`);
  }
  // The local header's own name/extra lengths — NOT the central directory's. Writers
  // are allowed to differ (extra fields get added on the way out), and using the wrong
  // one lands the read a few bytes off the payload.
  const nameLen = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`${name}: unsupported compression method ${entry.method}`);
}

/** Scan backwards for the end-of-central-directory record (it may carry a comment). */
function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new Error('not a ZIP archive (no end-of-central-directory record)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP writing — store method, mirroring src/lib/dataset/zip.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a stored (uncompressed) ZIP. The payload is JPEG plus one small JSON file;
 * deflating already-entropy-coded JPEG buys ~0–2 %, so the archive is written as-is —
 * same choice, and the same format subset, as the in-app exporter.
 *
 * @param {Array<{path: string, data: Buffer}>} files
 */
export function buildZip(files, date = new Date()) {
  const { time: dosTime, date: dosDate } = toDosDateTime(date);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const crc = crc32(file.data);
    const size = file.data.length;
    if (offset > 0xffffffff || size > 0xffffffff) {
      throw new Error('archive exceeds 4 GiB — ZIP64 is not implemented');
    }

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(size, 18); // compressed
    local.writeUInt32LE(size, 22); // uncompressed — identical, the data is stored
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(SIG_CENTRAL, 0);
    header.writeUInt16LE(0x0314, 4); // version made by
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(crc >>> 0, 16);
    header.writeUInt32LE(size, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(0, 30); // extra len + comment len
    header.writeUInt32LE(0, 34); // disk start + internal attrs
    header.writeUInt32LE(0, 38); // external attrs
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);

    parts.push(local, file.data);
    central.push(header);
    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_EOCD, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

/** MS-DOS date/time (APPNOTE 4.4.6): two-second resolution, epoch 1980. */
function toDosDateTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge every export's manifest into one pool.
 *
 * DUPLICATE IDS ABORT THE RUN. `id` is derived from the clip name and the swing/frame
 * indices, so the same clip extracted into two exports yields the same id twice — and
 * the two frames are not guaranteed to be the same picture, because the selection they
 * came out of may have changed between runs. Silently keeping one would put a frame in
 * the eval set whose bytes do not match its metadata, which is precisely the failure
 * the reserved-id list exists to prevent. So it stops and names the offenders.
 */
export function buildPool(zipFiles) {
  const pool = [];
  const seen = new Map(); // id → export file it came from
  const duplicates = [];
  const exports = [];

  for (const file of zipFiles) {
    const zip = openZip(file);
    const manifest = JSON.parse(readEntry(zip, 'manifest.json').toString('utf8'));
    const name = path.basename(file);
    exports.push({
      file: name,
      appVersion: manifest.appVersion,
      extractedAt: manifest.extractedAt,
      frameCount: manifest.frames.length,
    });
    for (const frame of manifest.frames) {
      const prior = seen.get(frame.id);
      if (prior) {
        duplicates.push({ id: frame.id, first: prior, second: name });
        continue;
      }
      seen.set(frame.id, name);
      pool.push({ ...frame, exportFile: name });
    }
  }
  return { pool, exports, duplicates };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

/** Hard guard on the one thing this script must never do: write outside data/shaft/. */
function assertInsideDataShaft(target) {
  const resolved = path.resolve(target);
  const rel = path.relative(WRITE_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside data/shaft/: ${resolved}`);
  }
  return resolved;
}

function writeGuarded(target, data) {
  const file = assertInsideDataShaft(target);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
}

function summaryMarkdown(result, pool, exports, outDir) {
  const pct = (n) => `${((n / Math.max(1, result.frames.length)) * 100).toFixed(0)} %`;
  const poolByPhase = tally(pool, (f) => f.phase);
  const poolBySource = tally(pool, (f) => f.source);

  const lines = [
    '# Kalibreringsset — sammanfattning',
    '',
    'Genererat av `scripts/build-calibration-set.mjs`. **Redigera inte för hand** —',
    'kör om skriptet. Setet är permanent evalset: ids i `reserved-ids.txt` får aldrig',
    'ingå i träningsdata (se docs/shaft/annotation-spec.md → *Kalibreringsset*).',
    '',
    `- Frames: **${result.frames.length}** av ${CALIBRATION_SIZE} önskade`,
    `- Pool: ${pool.length} frames ur ${exports.length} export${exports.length === 1 ? '' : 'er'}`,
    `- Seed: \`0x${SELECTION_SEED.toString(16)}\` (konstant i skriptet)`,
    `- Svingar representerade: ${result.swingCount} — max ${result.maxFramesPerSwing} frame(s) per sving`,
    `- Utdata: \`${path.relative(ROOT, outDir).replace(/\\/g, '/')}/\``,
    '',
    '## Fasfördelning',
    '',
    '| Fas | Mål | Faktiskt | Andel | I poolen |',
    '|---|---:|---:|---:|---:|',
    ...PHASE_ORDER.map((p) => {
      const got = result.byPhase[p] ?? 0;
      return `| \`${p}\` | ${PHASE_QUOTAS[p]} | ${got} | ${pct(got)} | ${poolByPhase[p] ?? 0} |`;
    }),
    `| **Totalt** | **${CALIBRATION_SIZE}** | **${result.frames.length}** | | ${pool.length} |`,
    '',
    '## Källfördelning',
    '',
    '| Source | Faktiskt | Andel | I poolen |',
    '|---|---:|---:|---:|',
    ...SOURCES.map(
      (s) => `| \`${s}\` | ${result.bySource[s] ?? 0} | ${pct(result.bySource[s] ?? 0)} | ${poolBySource[s] ?? 0} |`,
    ),
    '',
    '## Exporter i poolen',
    '',
    '| Fil | appVersion | extractedAt | Frames |',
    '|---|---|---|---:|',
    ...exports.map((e) => `| \`${e.file}\` | ${e.appVersion ?? '—'} | ${e.extractedAt ?? '—'} | ${e.frameCount} |`),
    '',
  ];

  const notes = [];
  for (const [phase, missing] of Object.entries(result.shortfallByPhase)) {
    if (missing > 0) notes.push(`- \`${phase}\`: ${missing} frame(s) saknades i poolen.`);
  }
  if (result.filledFromDownswing > 0) {
    notes.push(`- ${result.filledFromDownswing} frame(s) fylldes upp från \`downswing\` enligt spec.`);
  }
  if (result.filledFromAnyPhase > 0) {
    notes.push(
      `- **Varning:** ${result.filledFromAnyPhase} frame(s) fylldes från övriga faser — ` +
        '`downswing` räckte inte heller. Poolen är för liten; fasfördelningen ovan är inte spec-enlig.',
    );
  }
  if (result.frames.length < CALIBRATION_SIZE) {
    notes.push(
      `- **Varning:** setet är ${CALIBRATION_SIZE - result.frames.length} frame(s) kort. ` +
        'Extrahera fler klipp och kör om innan annoteringen startar.',
    );
  }
  if (result.maxFramesPerSwing > 1) {
    notes.push(
      `- **Varning:** upp till ${result.maxFramesPerSwing} frames från samma sving — ` +
        'poolen har färre svingar än setet behöver för en frame var.',
    );
  }
  if (notes.length) lines.push('## Anmärkningar', '', ...notes, '');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { exportsDir: DEFAULT_EXPORTS_DIR, outDir: DEFAULT_OUT_DIR, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--exports') opts.exportsDir = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--out') opts.outDir = path.resolve(ROOT, argv[++i] ?? '');
    else throw new Error(`unknown flag: ${arg}`);
  }
  return opts;
}

function main(argv) {
  const { exportsDir, outDir, dryRun } = parseArgs(argv);

  if (!existsSync(exportsDir)) {
    console.error(`No exports directory: ${exportsDir}`);
    process.exitCode = 1;
    return;
  }
  const zipFiles = readdirSync(exportsDir)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .sort()
    .map((f) => path.join(exportsDir, f));

  if (zipFiles.length === 0) {
    console.error(`No .zip files in ${exportsDir}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Reading ${zipFiles.length} export(s) from ${path.relative(ROOT, exportsDir)}…`);

  const { pool, exports, duplicates } = buildPool(zipFiles);
  for (const e of exports) console.log(`  ${e.file}: ${e.frameCount} frames (${e.appVersion ?? 'unknown build'})`);

  if (duplicates.length > 0) {
    console.error(`\nABORT: ${duplicates.length} duplicate frame id(s) across exports.`);
    for (const d of duplicates.slice(0, 20)) {
      console.error(`  ${d.id} — in both ${d.first} and ${d.second}`);
    }
    if (duplicates.length > 20) console.error(`  … and ${duplicates.length - 20} more`);
    console.error(
      '\nThe same clip has been extracted into more than one export. Remove the older\n' +
        'export (or re-export the overlap as one run) and try again — a duplicate id\n' +
        'means a frame in the eval set whose bytes may not match its metadata.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Pool: ${pool.length} frames, ${new Set(pool.map(swingKey)).size} swings.`);

  const result = selectCalibrationSet(pool);
  console.log(`Drew ${result.frames.length} frames across ${result.swingCount} swings.`);
  for (const p of PHASE_ORDER) console.log(`  ${p.padEnd(10)} ${result.byPhase[p] ?? 0}/${PHASE_QUOTAS[p]}`);
  for (const s of SOURCES) console.log(`  ${s.padEnd(10)} ${result.bySource[s] ?? 0}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  // Re-open only the exports the draw actually needs, and pull the JPEGs.
  const needed = new Map(); // export file → frames drawn from it
  for (const f of result.frames) {
    const list = needed.get(f.exportFile);
    if (list) list.push(f);
    else needed.set(f.exportFile, [f]);
  }
  const jpegs = new Map();
  for (const [file, frames] of needed) {
    const zip = openZip(path.join(exportsDir, file));
    for (const f of frames) jpegs.set(f.id, readEntry(zip, `frames/${f.id}.jpg`));
  }

  const manifest = {
    calibration: true,
    generatedBy: 'scripts/build-calibration-set.mjs',
    generatedAt: new Date().toISOString(),
    selectionSeed: `0x${SELECTION_SEED.toString(16)}`,
    phaseQuotas: PHASE_QUOTAS,
    sourceExports: exports,
    poolFrameCount: pool.length,
    frameCount: result.frames.length,
    // Same per-frame shape as the export manifests, plus the calibration marker. The
    // extra `exportFile` says which archive the JPEG was lifted out of.
    frames: result.frames.map((f) => ({ ...f, calibration: true })),
  };

  const zipBytes = buildZip([
    { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    ...result.frames.map((f) => ({ path: `frames/${f.id}.jpg`, data: jpegs.get(f.id) })),
  ]);

  const written = [
    writeGuarded(path.join(outDir, 'calibration.zip'), zipBytes),
    writeGuarded(path.join(outDir, 'reserved-ids.txt'), result.frames.map((f) => f.id).join('\n') + '\n'),
    writeGuarded(path.join(outDir, 'summary.md'), summaryMarkdown(result, pool, exports, outDir)),
  ];
  console.log('\nWrote:');
  for (const file of written) console.log(`  ${path.relative(ROOT, file).replace(/\\/g, '/')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
