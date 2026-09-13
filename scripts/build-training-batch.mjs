#!/usr/bin/env node
// Draw a TRAINING BATCH out of the exported dataset ZIPs, with the calibration set
// (and every earlier batch) excluded.
//
// WHAT THIS IS FOR. The calibration set is the permanent eval set and is never trained
// on (docs/shaft/annotation-spec.md → *Kalibreringssetet: dra, reservera, respektera*).
// Everything else in the pool is fair game for annotation, and this script cuts the
// first slice of it. The exclusion is the whole reason the script exists rather than
// someone hand-picking frames: one reserved id that leaks into training turns every
// number the eval set later produces into a memorisation score.
//
// FAIL LOUD, NEVER QUIETLY. A missing `reserved-ids.txt` aborts. It is the one input
// whose absence looks exactly like "nothing to exclude", and that failure mode is
// silent, permanent, and only discovered when the eval numbers are implausibly good.
//
// SAME DRAW AS THE CALIBRATION SET. `selectCalibrationSet` from
// `build-calibration-set.mjs` is reused verbatim — it already takes `size`, `quotas`,
// `seed` and `maxPerSwing`, and it is the unit-tested implementation of "spread over
// swings, balance web/own, fill a dry phase from downswing". Re-implementing it here
// would mean two copies of the subtle part drifting apart. Only the seed and the
// quotas differ.
//
// SEPARATE SEED. `TRAINING_SEED` is deliberately not `SELECTION_SEED`. Sharing a seed
// with the calibration draw would correlate the two shuffles, so the training batch
// would preferentially pull the frames that just missed the calibration cut — a
// training set biased towards the eval set's near-neighbours.
//
// PHASE QUOTAS COME FROM THE SPEC WEIGHTS, resolved for whatever `--n` is asked for
// (largest remainder). See the note on `PHASE_TARGET_WEIGHTS` below: the calibration
// script's hard-coded quotas do NOT match the spec table, and this script follows the
// spec.
//
// Usage:
//   node scripts/build-training-batch.mjs
//   node scripts/build-training-batch.mjs --n 150 --out data/shaft/training/batch-01
//   node scripts/build-training-batch.mjs --exclude data/shaft/training/batch-01/ids.txt
//   node scripts/build-training-batch.mjs --dry-run    # pool + draw, writes nothing

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  openZip,
  readEntry,
  buildZip,
  buildPool,
  selectCalibrationSet,
  swingKey,
  PHASE_ORDER,
} from './build-calibration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The only directory this script may write into. Same guard as the calibration draw. */
const WRITE_ROOT = path.join(ROOT, 'data', 'shaft');

const DEFAULT_EXPORTS_DIR = path.join(WRITE_ROOT, 'exports');
const TRAINING_ROOT = path.join(WRITE_ROOT, 'training');
const DEFAULT_OUT_DIR = path.join(TRAINING_ROOT, 'batch-01');
const RESERVED_IDS_FILE = path.join(WRITE_ROOT, 'calibration', 'reserved-ids.txt');

/** Frames in a batch when `--n` is not given. */
export const DEFAULT_BATCH_SIZE = 150;

/**
 * DRAW SEED — a constant, never a CLI flag and never time-derived, so a batch is
 * re-derivable from the same exports a year from now.
 *
 * Distinct from the calibration draw's `SELECTION_SEED` (0x5caff01d) on purpose; see
 * the header. Changing it re-draws the batch, which after annotation has started means
 * paying for the same frames twice — don't.
 */
export const TRAINING_SEED = 0x7ba7c0de;

/**
 * Phase target weights — docs/shaft/annotation-spec.md → *Fasfördelning — målvikter*,
 * which the spec names as the authoritative source. Mirrors `PHASE_TARGET_WEIGHTS` in
 * src/lib/dataset/phaseQuota.ts and must be kept in sync with it by hand.
 *
 * NOTE — these are NOT the calibration script's `PHASE_QUOTAS` (downswing 40 / impact 15 /
 * top 12 / backswing 12 / through 9 / address 7 / finish 5 for a set of 100). Those
 * differ from the spec table and from phaseQuota.ts, despite the comment there claiming
 * to be the table resolved to whole frames. The calibration set is drawn and annotated,
 * so it is not being re-drawn over this; the training batch follows the spec.
 */
export const PHASE_TARGET_WEIGHTS = {
  idle: 0.02,
  address: 0.06,
  backswing: 0.14,
  top: 0.1,
  downswing: 0.34,
  impact: 0.18,
  through: 0.1,
  finish: 0.06,
};

/** The two `source` values a frame can carry; reported, and balanced by the draw. */
const SOURCES = ['web', 'own'];

/**
 * The CVAT tag label that carries the pre-filled `phase`.
 *
 * A TAG, not an attribute on the `shaft` skeleton. Pre-filling an attribute that lives
 * on the shaft object would mean shipping a shaft object per frame — i.e. pre-placed
 * keypoints — which is exactly the bias the independent annotation is supposed to avoid.
 * A tag is CVAT's per-frame annotation type and carries attributes without touching the
 * shape being annotated. See `prefillNotes` for the consequences.
 */
const PHASE_TAG_LABEL = 'frame_meta';

// ─────────────────────────────────────────────────────────────────────────────
// Selection — pure, deterministic, unit-tested (build-training-batch.test.mjs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve fractional phase weights to whole frames by largest remainder.
 *
 * Largest remainder rather than rounding each share independently: rounding does not
 * sum to `n` (0.34·150 = 51, 0.14·150 = 21, … the errors do not cancel), and a quota
 * table that sums to 149 or 152 silently changes the batch size. Ties break on
 * `PHASE_ORDER`, so the result is a pure function of `n` and the weights.
 *
 * @param {number} n batch size
 * @param {Record<string, number>} [weights]
 * @returns {Record<string, number>} whole frames per phase, summing to exactly `n`
 */
export function phaseQuotas(n, weights = PHASE_TARGET_WEIGHTS) {
  const phases = PHASE_ORDER.filter((p) => (weights[p] ?? 0) > 0);
  const exact = phases.map((phase) => ({ phase, want: n * (weights[phase] ?? 0) }));
  const quotas = Object.fromEntries(phases.map((p) => [p, 0]));

  let assigned = 0;
  for (const { phase, want } of exact) {
    quotas[phase] = Math.floor(want);
    assigned += quotas[phase];
  }
  // Hand out what rounding left over, largest fractional part first.
  const byRemainder = [...exact]
    .map((e, i) => ({ ...e, remainder: e.want - Math.floor(e.want), order: i }))
    .sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (let i = 0; assigned < n; i++, assigned++) {
    quotas[byRemainder[i % byRemainder.length].phase]++;
  }
  return quotas;
}

/**
 * Read an id list — one id per line, `#` comments and blanks ignored.
 *
 * @param {string} file
 * @param {{required?: boolean}} [opts] `required` makes a missing file throw
 * @returns {Set<string>}
 */
export function readIdList(file, { required = false } = {}) {
  if (!existsSync(file)) {
    if (required) {
      throw new Error(
        `MISSING REQUIRED FILE: ${file}\n\n` +
          'This is the calibration set\'s reserved-id list. Without it the draw cannot know\n' +
          'which frames are the permanent eval set, and a batch drawn now would very likely\n' +
          'contain frames that are already annotated as eval — which silently turns every\n' +
          'future eval number into a memorisation score.\n\n' +
          'Re-generate it with `node scripts/build-calibration-set.mjs`, or restore it from\n' +
          'wherever data/shaft/ is backed up. Refusing to draw.',
      );
    }
    return new Set();
  }
  const ids = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  return new Set(ids);
}

/**
 * Remove every excluded id from the pool.
 *
 * Returns the ids that were actually hit as well as the ones that were not, because
 * both are diagnostics: a reserved id that is NOT in the pool means the export it came
 * from is missing from `exports/`, and the pool being drawn from is not the pool the
 * calibration set was drawn from.
 *
 * @param {Array<{id: string}>} pool
 * @param {Set<string>} excluded
 */
export function excludeIds(pool, excluded) {
  const kept = [];
  const hit = new Set();
  for (const frame of pool) {
    if (excluded.has(frame.id)) hit.add(frame.id);
    else kept.push(frame);
  }
  const missing = [...excluded].filter((id) => !hit.has(id)).sort();
  return { kept, removedCount: hit.size, missing };
}

/**
 * Draw a training batch: exclude, then run the calibration draw with training settings.
 *
 * @param {Array<object>} pool frame metadata from `buildPool`
 * @param {Set<string>} excluded every id that may not appear (reserved + earlier batches)
 * @param {{size?: number, seed?: number, weights?: Record<string, number>, maxPerSwing?: number}} [opts]
 */
export function selectTrainingBatch(pool, excluded, opts = {}) {
  const {
    size = DEFAULT_BATCH_SIZE,
    seed = TRAINING_SEED,
    weights = PHASE_TARGET_WEIGHTS,
    maxPerSwing = 1,
  } = opts;

  const { kept, removedCount, missing } = excludeIds(pool, excluded);
  const quotas = phaseQuotas(size, weights);
  const result = selectCalibrationSet(kept, { size, quotas, seed, maxPerSwing });

  // Belt and braces. The draw can only pick from `kept`, so this cannot fire — which is
  // exactly why it is cheap to assert: the cost of the invariant being wrong is a
  // poisoned eval set discovered months later.
  const leaked = result.frames.filter((f) => excluded.has(f.id));
  if (leaked.length > 0) {
    throw new Error(`excluded ids leaked into the draw: ${leaked.map((f) => f.id).join(', ')}`);
  }

  return { ...result, quotas, poolAfterExclusion: kept.length, excludedFromPool: removedCount, excludedNotInPool: missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// CVAT pre-fill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A "CVAT for images 1.1" XML that pre-fills `phase` as a per-frame tag.
 *
 * FORMAT VERIFIED against CVAT's own docs rather than assumed:
 *   - `<tag label="…" source="manual">` with nested
 *     `<attribute name="…">value</attribute>` is the documented per-frame annotation
 *     element of the CVAT-for-images 1.1 format.
 *   - The label schema (`<label><type>tag</type><attributes>…`) CANNOT be created by
 *     importing this file: "Only label names can be imported this way, colors,
 *     attributes, and skeleton labels must be defined manually." So the schema has to
 *     exist on the task first — hence the companion `labels-frame-meta.json`.
 *   - `cvat-cli task create … --labels labels.json --annotation_path prefill-phase.xml
 *     --annotation_format "CVAT 1.1"` does both in one command.
 *
 * `image/@name` must match the image name as the task sees it. Names here carry the
 * `frames/` prefix, matching `batch.zip`'s layout (CVAT keeps relative paths from an
 * uploaded archive). Creating the task from a plain directory of JPEGs instead makes the
 * names bare — strip the prefix in that case; `summary.md` says so.
 *
 * @param {Array<object>} frames drawn frames, in the order they appear in the task
 */
export function prefillPhaseXml(frames) {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

  const phases = PHASE_ORDER.filter((p) => (PHASE_TARGET_WEIGHTS[p] ?? 0) > 0);
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<annotations>',
    '  <version>1.1</version>',
    '  <meta>',
    '    <task>',
    `      <size>${frames.length}</size>`,
    '      <mode>annotation</mode>',
    '      <labels>',
    '        <label>',
    `          <name>${PHASE_TAG_LABEL}</name>`,
    '          <type>tag</type>',
    '          <attributes>',
    '            <attribute>',
    '              <name>phase</name>',
    '              <mutable>False</mutable>',
    '              <input_type>select</input_type>',
    `              <default_value>${esc(phases[0])}</default_value>`,
    `              <values>${phases.map(esc).join('&#xA;')}</values>`,
    '            </attribute>',
    '          </attributes>',
    '        </label>',
    '      </labels>',
    '    </task>',
    '  </meta>',
  ];

  frames.forEach((frame, i) => {
    lines.push(`  <image id="${i}" name="frames/${esc(frame.id)}.jpg">`);
    lines.push(`    <tag label="${PHASE_TAG_LABEL}" source="manual">`);
    lines.push(`      <attribute name="phase">${esc(frame.phase)}</attribute>`);
    lines.push('    </tag>');
    lines.push('  </image>');
  });

  lines.push('</annotations>', '');
  return lines.join('\n');
}

/**
 * The label schema for the pre-filled tag, in the JSON shape `cvat-cli --labels` takes.
 *
 * Only the `frame_meta` tag label. The `shaft` skeleton is deliberately NOT synthesised
 * here: CVAT skeleton labels must be defined manually (they carry sublabel ids and an
 * SVG), and shipping a guessed one that fails at task creation is worse than shipping
 * nothing. Add this label alongside the existing `shaft` label rather than replacing it.
 */
export function frameMetaLabelsJson() {
  const phases = PHASE_ORDER.filter((p) => (PHASE_TARGET_WEIGHTS[p] ?? 0) > 0);
  return `${JSON.stringify(
    [
      {
        name: PHASE_TAG_LABEL,
        type: 'tag',
        attributes: [
          { name: 'phase', mutable: false, input_type: 'select', default_value: phases[0], values: phases },
        ],
      },
    ],
    null,
    2,
  )}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

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

const tally = (items, key) => {
  const out = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

export function summaryMarkdown(result, context) {
  const { size, outName, exports, poolSize, excludeSources, seed } = context;
  const pct = (n) => `${((n / Math.max(1, result.frames.length)) * 100).toFixed(0)} %`;
  const L = [];

  L.push(`# Träningsbatch \`${outName}\` — sammanfattning`, '');
  L.push(
    'Genererad av `scripts/build-training-batch.mjs`. **Redigera inte för hand** — kör om',
    'skriptet. Kalibreringssetet är exkluderat; se *Exkludering* nedan.',
    '',
  );
  L.push(`- Frames: **${result.frames.length}** av ${size} önskade`);
  L.push(`- Pool: ${poolSize} frames ur ${exports.length} exporter, ${result.poolAfterExclusion} kvar efter exkludering`);
  L.push(`- Seed: \`0x${seed.toString(16)}\` (konstant i skriptet, skild från kalibreringens)`);
  L.push(`- Svingar representerade: ${result.swingCount} — max ${result.maxFramesPerSwing} frame(s) per sving`);
  L.push('');

  L.push('## Exkludering', '');
  L.push('| Källa | Ids | Träffade i poolen | Saknades i poolen |', '|---|---:|---:|---:|');
  for (const s of excludeSources) {
    L.push(`| \`${s.rel}\`${s.required ? ' **(obligatorisk)**' : ''} | ${s.count} | — | — |`);
  }
  L.push(`| **Totalt unika** | **${excludeSources.reduce((a, s) => a + s.count, 0)}** | ${result.excludedFromPool} | ${result.excludedNotInPool.length} |`);
  L.push('');
  if (result.excludedNotInPool.length > 0) {
    L.push(
      `> ⚠️ ${result.excludedNotInPool.length} exkluderade id(n) finns inte i poolen. Det betyder att`,
      '> exporten de kom ur saknas i `data/shaft/exports/` — poolen här är alltså inte samma pool',
      '> som kalibreringssetet drogs ur. Draget är fortfarande säkert (ingen av dem kan komma med),',
      '> men fasfördelningen nedan är räknad på ett annat underlag än specen antar.',
      '',
      `> ${result.excludedNotInPool.slice(0, 10).map((i) => `\`${i}\``).join(', ')}${result.excludedNotInPool.length > 10 ? ` … +${result.excludedNotInPool.length - 10}` : ''}`,
      '',
    );
  } else {
    L.push('Varje exkluderat id fanns i poolen och togs bort. Inget reserverat id kan ha kommit med.', '');
  }

  L.push('## Fasfördelning', '');
  L.push('| Fas | Målvikt | Kvot | Faktiskt | Andel |', '|---|---:|---:|---:|---:|');
  for (const p of PHASE_ORDER) {
    const weight = PHASE_TARGET_WEIGHTS[p] ?? 0;
    const got = result.byPhase[p] ?? 0;
    L.push(`| \`${p}\` | ${(weight * 100).toFixed(0)} % | ${result.quotas[p] ?? 0} | ${got} | ${pct(got)} |`);
  }
  L.push(`| **Totalt** | **100 %** | **${size}** | **${result.frames.length}** | |`, '');
  const short = PHASE_ORDER.filter((p) => (result.shortfallByPhase[p] ?? 0) > 0);
  if (short.length > 0) {
    L.push(
      `> ⚠️ Poolen räckte inte för ${short.map((p) => `\`${p}\` (−${result.shortfallByPhase[p]})`).join(', ')}.`,
      `> ${result.filledFromDownswing} frame(s) fylldes från \`downswing\`` +
        (result.filledFromAnyPhase > 0 ? `, ${result.filledFromAnyPhase} från övriga faser (poolen är för liten).` : '.'),
      '',
    );
  }

  L.push('## Källfördelning', '');
  L.push('| Source | Faktiskt | Andel |', '|---|---:|---:|');
  for (const s of SOURCES) L.push(`| \`${s}\` | ${result.bySource[s] ?? 0} | ${pct(result.bySource[s] ?? 0)} |`);
  L.push('');

  L.push('## Exporter i poolen', '');
  L.push('| Fil | appVersion | extractedAt | Frames |', '|---|---|---|---:|');
  for (const e of exports) L.push(`| \`${e.file}\` | ${e.appVersion ?? '—'} | ${e.extractedAt ?? '—'} | ${e.frameCount} |`);
  L.push('');

  L.push(...prefillNotes());
  return L.join('\n') + '\n';
}

/**
 * What CVAT actually accepts for pre-filled frame attributes.
 *
 * The brief said: find out what works, and if nothing does, say so plainly instead of
 * shipping something that doesn't. Something does work — with two constraints that are
 * easy to trip over, so they are written down here rather than discovered in CVAT.
 *
 * DISABLED: prefill-phase.xml is NOT written by this script until phase derivation
 * improves. `prefillPhaseXml` stays here so the capability can be re-enabled when
 * the derivation error rate drops below a useful threshold. See docs/oppna-fragor.md F5.
 */
function prefillNotes() {
  return [
    '## Förifylld `phase` i CVAT — AVSTÄNGD',
    '',
    '> ⚠️ **Förifyllning är tillfälligt inaktiverad.** Fashärledningen ur envelope hade',
    '> ~50 % felfrekvens mot manuell bedömning på batch-01 — fler rättningar än noll',
    '> förifyllningar. `prefill-phase.xml` skrivs INTE av det här skriptet tills vidare.',
    '> Annotatören sätter `phase` för hand som vilket annat attribut som helst. Se',
    '> docs/oppna-fragor.md → F5 och `scripts/reconcile-phase.mjs` för batch-01.',
    '',
    'Förmågan att generera filen finns kvar i `prefillPhaseXml()` och kan aktiveras igen',
    'när fashärledningen är bättre. Det verifierade formatet är dokumenterat nedan för',
    'referens.',
    '',
    '| Fil | Vad den är |',
    '|---|---|',
    '| `prefill-phase.xml` | **CVAT for images 1.1** — ett `<image>` per frame med en `<tag label="frame_meta">` som bär `<attribute name="phase">`. `<tag>` är CVAT:s dokumenterade per-frame-annotering. |',
    '| `labels-frame-meta.json` | Etikettschemat för taggen, i den JSON-form `cvat-cli --labels` tar. |',
    '',
    '```bash',
    '# Allt i ett kommando: schema + bilder + förifylld phase',
    'cvat-cli task create "shaft <batch>" \\',
    '  --labels labels-frame-meta.json \\',
    '  --annotation_path prefill-phase.xml \\',
    '  --annotation_format "CVAT 1.1" \\',
    '  local frames/',
    '```',
    '',
    '**Två fallgropar, båda verifierade:**',
    '',
    '1. **Schemat kan inte importeras.** CVAT:s dokumentation är explicit: *"Only label names',
    '   can be imported this way, colors, attributes, and skeleton labels must be defined',
    '   manually."* Attributet `phase` måste alltså finnas på tasken **innan** XML:en laddas upp —',
    '   antingen via `--labels` ovan, eller genom att lägga till etiketten för hand i',
    '   etikettkonstruktorn. Laddar man bara upp XML:en mot en task utan `frame_meta`-etiketten',
    '   tas taggarna tyst inte emot.',
    '2. **`image/@name` måste matcha bildens namn i tasken.** Namnen i XML:en har prefixet',
    '   `frames/`, vilket matchar `batch.zip` (CVAT behåller relativa sökvägar ur ett uppladdat',
    '   arkiv). Skapas tasken i stället från en katalog med lösa JPEG:ar heter bilderna bara',
    '   `<id>.jpg` — ta då bort prefixet först:',
    '   `sed -i \'s| name="frames/| name="|\' prefill-phase.xml`.',
    '',
    '**En designkonsekvens värd att känna till.** `phase` läggs som en **tag**, inte som ett',
    'attribut på `shaft`-skelettet där `view`/`blur`/`no_shaft` sitter. Skälet är att ett',
    'attribut på skelettet bara kan förifyllas genom att skicka med ett skelettobjekt per',
    'frame — alltså förplacerade punkter, precis den styrning annoteringen ska vara fri från.',
    'Följden är att `phase` i exporten hamnar som en tagg-annotering och inte i',
    '`annotations[].attributes` som i kalibreringsexporterna. `scripts/measure-calibration.mjs`',
    'läser `phase` därifrån; kör den mot en batch annoterad med det här schemat och',
    '`phase`-hinkarna blir tomma. Manifestet nedan bär fasen oavsett, och det är den',
    'auktoritativa källan.',
    '',
    '## Filer',
    '',
    '| Fil | Innehåll |',
    '|---|---|',
    '| `batch.zip` | `frames/<id>.jpg` + `manifest.json` (samma per-frame-format som exporterna, plus `trainingBatch: true`). |',
    '| `ids.txt` | Ett id per rad. **Skicka in den som `--exclude` till nästa batch** — eller lita på att den hittas automatiskt, se nedan. |',
    '| `labels-frame-meta.json` | Etikettschema för taggen. |',
    '| `prefill-phase.xml` | **Skrivs ej** — förifyllning inaktiverad, se *Förifylld `phase` i CVAT* ovan. |',
    '| `summary.md` | Den här filen. |',
    '',
    'Nästa batch hittar `ids.txt` **automatiskt**: skriptet läser varje',
    '`data/shaft/training/*/ids.txt` utom sin egen utdatakatalog och exkluderar allt som står',
    'där, utöver `reserved-ids.txt`. Vilka filer som lästes står under *Exkludering* ovan —',
    'kontrollera den tabellen, den är hela skyddet mot att annotera samma frame två gånger.',
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { exportsDir: DEFAULT_EXPORTS_DIR, outDir: DEFAULT_OUT_DIR, size: DEFAULT_BATCH_SIZE, dryRun: false, extraExcludes: [], autoExclude: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--no-auto-exclude') opts.autoExclude = false;
    else if (arg === '--n') {
      opts.size = Number(argv[++i]);
      if (!Number.isInteger(opts.size) || opts.size <= 0) throw new Error(`--n must be a positive integer, got: ${argv[i]}`);
    } else if (arg === '--out') opts.outDir = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--exports') opts.exportsDir = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--exclude') opts.extraExcludes.push(path.resolve(ROOT, argv[++i] ?? ''));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** Every earlier batch's `ids.txt`, so a frame is never annotated twice. */
function siblingIdLists(outDir) {
  if (!existsSync(TRAINING_ROOT)) return [];
  return readdirSync(TRAINING_ROOT)
    .sort()
    .map((name) => path.join(TRAINING_ROOT, name))
    .filter((dir) => statSync(dir).isDirectory() && path.resolve(dir) !== path.resolve(outDir))
    .map((dir) => path.join(dir, 'ids.txt'))
    .filter((file) => existsSync(file));
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function main(argv) {
  const opts = parseArgs(argv);

  if (!existsSync(opts.exportsDir)) {
    console.error(`No exports directory: ${rel(opts.exportsDir)}`);
    process.exitCode = 1;
    return;
  }
  const zipFiles = readdirSync(opts.exportsDir)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .sort()
    .map((f) => path.join(opts.exportsDir, f));
  if (zipFiles.length === 0) {
    console.error(`No .zip files in ${rel(opts.exportsDir)}`);
    process.exitCode = 1;
    return;
  }

  // Reserved ids FIRST: a missing list must stop the run before anything expensive, and
  // long before anything is written.
  const excludeFiles = [
    { file: RESERVED_IDS_FILE, required: true },
    ...siblingIdLists(opts.outDir).map((file) => ({ file, required: false })),
    ...opts.extraExcludes.map((file) => ({ file, required: true })),
  ];
  const excluded = new Set();
  const excludeSources = [];
  for (const { file, required } of excludeFiles) {
    const ids = readIdList(file, { required });
    for (const id of ids) excluded.add(id);
    excludeSources.push({ rel: rel(file), count: ids.size, required });
    console.log(`Excluding ${ids.size} id(s) from ${rel(file)}${required ? ' (required)' : ''}`);
  }

  console.log(`Reading ${zipFiles.length} export(s) from ${rel(opts.exportsDir)}…`);
  const { pool, exports, duplicates } = buildPool(zipFiles);
  for (const e of exports) console.log(`  ${e.file}: ${e.frameCount} frames (${e.appVersion ?? 'unknown build'})`);

  if (duplicates.length > 0) {
    console.error(`\nABORT: ${duplicates.length} duplicate frame id(s) across exports.`);
    for (const d of duplicates.slice(0, 20)) console.error(`  ${d.id} — in both ${d.first} and ${d.second}`);
    console.error('\nRemove the older export (or re-export the overlap as one run) and try again.');
    process.exitCode = 1;
    return;
  }

  const result = selectTrainingBatch(pool, excluded, { size: opts.size });
  console.log(`Pool: ${pool.length} frames → ${result.poolAfterExclusion} after excluding ${result.excludedFromPool}.`);
  if (result.excludedNotInPool.length > 0) {
    console.warn(`  WARN: ${result.excludedNotInPool.length} excluded id(s) are not in the pool — an export is missing from exports/.`);
  }
  console.log(`Drew ${result.frames.length} frames across ${result.swingCount} swings (max ${result.maxFramesPerSwing}/swing).`);
  for (const p of PHASE_ORDER) console.log(`  ${p.padEnd(10)} ${result.byPhase[p] ?? 0}/${result.quotas[p] ?? 0}`);
  for (const s of SOURCES) console.log(`  ${s.padEnd(10)} ${result.bySource[s] ?? 0}`);

  if (opts.dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  // Re-open only the exports the draw actually needs, and pull the JPEGs.
  const needed = new Map();
  for (const f of result.frames) {
    const list = needed.get(f.exportFile);
    if (list) list.push(f);
    else needed.set(f.exportFile, [f]);
  }
  const jpegs = new Map();
  for (const [file, frames] of needed) {
    const zip = openZip(path.join(opts.exportsDir, file));
    for (const f of frames) jpegs.set(f.id, readEntry(zip, `frames/${f.id}.jpg`));
  }

  const outName = path.basename(opts.outDir);
  const manifest = {
    trainingBatch: true,
    batchName: outName,
    generatedBy: 'scripts/build-training-batch.mjs',
    generatedAt: new Date().toISOString(),
    selectionSeed: `0x${TRAINING_SEED.toString(16)}`,
    phaseTargetWeights: PHASE_TARGET_WEIGHTS,
    phaseQuotas: result.quotas,
    excludedIdSources: excludeSources.map((s) => ({ file: s.rel, count: s.count })),
    excludedFromPool: result.excludedFromPool,
    sourceExports: exports,
    poolFrameCount: pool.length,
    poolAfterExclusion: result.poolAfterExclusion,
    frameCount: result.frames.length,
    // `phase` per frame is the point: it is what pre-fills the CVAT attribute, and it
    // stays the authoritative value even if the CVAT round-trip loses the tag.
    frames: result.frames.map((f) => ({ ...f, trainingBatch: outName })),
  };

  const zipBytes = buildZip([
    { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    ...result.frames.map((f) => ({ path: `frames/${f.id}.jpg`, data: jpegs.get(f.id) })),
  ]);

  // prefill-phase.xml DISABLED — phase derivation error rate ~50 % on batch-01.
  // Re-enable by un-commenting the line below when derivation improves. See F5 in
  // docs/oppna-fragor.md and scripts/reconcile-phase.mjs for the batch-01 analysis.
  // writeGuarded(path.join(opts.outDir, 'prefill-phase.xml'), prefillPhaseXml(result.frames)),

  const written = [
    writeGuarded(path.join(opts.outDir, 'batch.zip'), zipBytes),
    writeGuarded(path.join(opts.outDir, 'ids.txt'), result.frames.map((f) => f.id).join('\n') + '\n'),
    writeGuarded(path.join(opts.outDir, 'labels-frame-meta.json'), frameMetaLabelsJson()),
    writeGuarded(
      path.join(opts.outDir, 'summary.md'),
      summaryMarkdown(result, { size: opts.size, outName, exports, poolSize: pool.length, excludeSources, seed: TRAINING_SEED }),
    ),
  ];
  console.log('\nWrote:');
  for (const file of written) console.log(`  ${rel(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
