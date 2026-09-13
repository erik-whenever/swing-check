#!/usr/bin/env node
// Measure INTER-ANNOTATOR AGREEMENT on the shaft calibration set.
//
// WHAT THIS IS FOR. The 100 calibration frames are annotated independently by both
// annotators BEFORE production annotation starts (docs/shaft/annotation-spec.md →
// *Kalibreringsset*). This script compares the two COCO exports and writes
// `data/shaft/calibration/agreement.md`. It is a go/no-go gate: if the two people
// disagree about where a shaft endpoint sits, no amount of labelled data downstream is
// worth anything, because the labels themselves carry that spread as noise.
//
// WHAT IS MEASURED, AND WHY IN THIS ORDER.
//   Coverage       — did they annotate the same frames at all.
//   Flag agreement — outside/occluded/visible. A flag disagreement is a disagreement
//                    about whether the point is *knowable*, which is upstream of, and
//                    worse than, a few pixels of placement spread.
//   Distance       — the raw placement spread, px and normalised to image height. The
//                    set mixes 720×818 with 1080×1920 frames, so a 6 px spread is not
//                    the same error in both and a px-only median averages over
//                    incomparable things. Read the normalised figure; px is kept
//                    because that is what an annotator sees on re-opening the frame.
//   Per attribute  — phase/view/blur. The spec predicts downswing and severe blur are
//                    where the motion streak has to be judged; this is where that
//                    prediction meets numbers.
//   Shaft length   — a sanity check, not a precision measure: two annotators whose
//                    butt–hosel *distance* differs a lot on the same frame do not
//                    disagree by a few pixels, one of them has put an endpoint in the
//                    wrong place entirely (hands instead of grip end, clubhead centre
//                    instead of hosel).
//   Angle          — the number that matters for the product. The rules measure shaft
//                    ANGLES; a label off by 10 px ALONG the shaft axis costs nothing,
//                    one off by 10 px ACROSS it costs a rule. The rest is diagnostics
//                    for this line.
//
// VISIBILITY MAPPING. COCO keypoints encode v=0 (not annotated), v=1 (annotated, not
// visible) and v=2 (visible); CVAT maps `outside`→0 and `occluded`→1. That is an
// assumption about someone else's exporter and every number here rests on it, so
// `verifyVisibility` checks it against the actual file contents and the report leads
// with the verdict instead of burying it.
//
// NO NEW DEPENDENCIES. ZIP reading is `openZip`/`readEntry` from
// `build-calibration-set.mjs` — central-directory parsing plus `zlib` — reused rather
// than restated.
//
// Usage:
//   node scripts/measure-calibration.mjs
//   node scripts/measure-calibration.mjs --a data/shaft/calibration/erik.zip \
//                                        --b data/shaft/calibration/lisa.zip \
//                                        --out data/shaft/calibration/agreement.md
//   node scripts/measure-calibration.mjs --dry-run    # terminal summary, writes nothing

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { openZip, readEntry } from './build-calibration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The only directory this script may write into. Mirrors the builder's guard. */
const WRITE_ROOT = path.join(ROOT, 'data', 'shaft');
const CALIBRATION_DIR = path.join(WRITE_ROOT, 'calibration');

const DEFAULT_A = path.join(CALIBRATION_DIR, 'erik.zip');
const DEFAULT_B = path.join(CALIBRATION_DIR, 'lisa.zip');
const DEFAULT_OUT = path.join(CALIBRATION_DIR, 'agreement.md');

/** The COCO Keypoints payload inside a CVAT export of a keypoints task. */
const ANNOTATION_ENTRY = 'annotations/person_keypoints_default.json';

/** Skeleton point order — fixed by the spec, and asserted against the export. */
export const POINTS = ['butt', 'hosel'];

/** COCO visibility index → the spec's CVAT vocabulary. */
export const VISIBILITY = ['outside', 'occluded', 'visible'];

/** Frame attributes compared and split on, in report order. */
export const ATTRIBUTES = ['phase', 'view', 'blur'];

/** Value order per attribute, so tables read in swing/severity order, not hash order. */
export const ATTRIBUTE_VALUES = {
  phase: ['address', 'backswing', 'top', 'downswing', 'impact', 'through', 'finish'],
  view: ['dtl', 'face_on', 'other'],
  blur: ['none', 'mild', 'severe'],
};

/** Frames listed in the two manual-review tables. */
const WORST_SHAFT_LENGTH = 10;
const WORST_OVERALL = 15;

/**
 * Below this attribute agreement, section 4's split gets a warning.
 *
 * The buckets only hold frames both annotators labelled the same way, so poor agreement
 * about the LABEL quietly shrinks every bucket under it. At 58 % phase agreement the
 * downswing bucket is six frames — a number that looks like a measurement and is not one.
 */
const ATTRIBUTE_AGREEMENT_FLOOR = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// Maths — the part worth unit-testing
// ─────────────────────────────────────────────────────────────────────────────

/** Euclidean distance between two `{x, y}` points, in whatever unit they carry. */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Percentile by linear interpolation between closest ranks (numpy `linear`, R type 7).
 *
 * The buckets here get small — `blur=severe` is a dozen frames — so the choice of
 * estimator is visible in the output. Interpolating is the least surprising option and
 * matches what anyone re-checking these numbers in numpy will get.
 */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** `{n, median, p90, max}` for a sample; nulls (except `n`) for an empty one. */
export function summarize(values) {
  return {
    n: values.length,
    median: percentile(values, 50),
    p90: percentile(values, 90),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

/**
 * Direction of the shaft, butt → hosel, in degrees.
 *
 * Image coordinates run y-DOWN, so this is clockwise-positive rather than the usual
 * maths convention. Irrelevant to `angleDiffDeg`, which is all it feeds, and flipping
 * the sign here would only invite someone to "fix" it back.
 */
export function shaftAngleDeg(butt, hosel) {
  return (Math.atan2(hosel.y - butt.y, hosel.x - butt.x) * 180) / Math.PI;
}

/**
 * Smallest absolute angle between two directions, in degrees, always in [0, 180].
 *
 * NOT folded at 90°: butt→hosel is a DIRECTED vector because the two points are ordered,
 * so an annotator who swapped the endpoints shows up as ~180° instead of being silently
 * absorbed as 0°. That confusion is exactly what section 5 hunts for.
 */
export function angleDiffDeg(a, b) {
  const wrapped = ((((a - b) % 360) + 540) % 360) - 180;
  return Math.abs(wrapped);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/** `frames/<id>.jpg` → `<id>`. The frame id is the join key between the two exports. */
export function frameIdFromFileName(fileName) {
  return path.posix.basename(String(fileName).replace(/\\/g, '/')).replace(/\.jpe?g$/i, '');
}

/**
 * Parse one CVAT COCO Keypoints export into `{label, frames: Map<frameId, frame>, …}`.
 *
 * Keyed on frame id, never on COCO `image_id`: the ids happen to line up in the current
 * pair of exports, but they are per-task counters and nothing says two independently
 * created CVAT tasks number their images the same way.
 */
export function parseCoco(coco, label) {
  const category = (coco.categories ?? []).find((c) => c.name === 'shaft');
  if (!category) {
    const found = (coco.categories ?? []).map((c) => c.name).join(', ') || 'none';
    throw new Error(`${label}: no 'shaft' category in the export (found: ${found})`);
  }
  const order = category.keypoints ?? [];
  if (order.length !== POINTS.length || order.some((n, i) => n !== POINTS[i])) {
    throw new Error(
      `${label}: keypoint order is [${order.join(', ')}], expected [${POINTS.join(', ')}] — ` +
        'the spec fixes this order and every distance below assumes it',
    );
  }

  const imagesById = new Map((coco.images ?? []).map((img) => [img.id, img]));
  const frames = new Map();
  const duplicateAnnotations = [];

  for (const ann of coco.annotations ?? []) {
    if (ann.category_id !== category.id) continue;
    const image = imagesById.get(ann.image_id);
    if (!image) {
      throw new Error(`${label}: annotation ${ann.id} references unknown image_id ${ann.image_id}`);
    }
    const frameId = frameIdFromFileName(image.file_name);
    if (frames.has(frameId)) {
      // One shaft per frame is the whole point of the class. A second box means the
      // annotator drew twice; keep the first and say so rather than average them.
      duplicateAnnotations.push(frameId);
      continue;
    }

    const kp = ann.keypoints ?? [];
    const points = {};
    POINTS.forEach((name, i) => {
      points[name] = { x: kp[i * 3], y: kp[i * 3 + 1], v: kp[i * 3 + 2] };
    });

    frames.set(frameId, {
      frameId,
      width: image.width,
      height: image.height,
      points,
      numKeypoints: ann.num_keypoints,
      attributes: ann.attributes ?? {},
    });
  }

  // An image in the task with no annotation at all is a frame the annotator never
  // touched — distinct from one where both points were flagged `outside`.
  const unannotated = [...imagesById.values()]
    .map((img) => frameIdFromFileName(img.file_name))
    .filter((id) => !frames.has(id));

  return { label, frames, imageCount: imagesById.size, unannotated, duplicateAnnotations };
}

/** Read one CVAT export ZIP and parse its COCO payload. */
export function readExport(file, label) {
  const zip = openZip(file);
  const entry = zip.entries.has(ANNOTATION_ENTRY)
    ? ANNOTATION_ENTRY
    : [...zip.entries.keys()].find((n) => n.endsWith('.json'));
  if (!entry) {
    throw new Error(`${label}: no JSON annotation file in ${path.basename(file)}`);
  }
  const parsed = parseCoco(JSON.parse(readEntry(zip, entry).toString('utf8')), label);
  return { ...parsed, sourceFile: file, sourceEntry: entry };
}

/**
 * Check the COCO visibility encoding against what is actually in the file.
 *
 * The outside→0 / occluded→1 mapping is an assumption about CVAT's exporter, so rather
 * than trust it, assert what is checkable: the value domain, `num_keypoints` (COCO
 * defines it as the count of v>0, making it an independent witness of which flags the
 * exporter considers "placed"), and whether v=1 occurs at all — an export with no v=1
 * anywhere leaves occluded→1 UNCONFIRMED, not confirmed.
 */
export function verifyVisibility(parsed) {
  const notes = [];
  const seen = new Map();
  let numKeypointsMismatch = 0;
  let placedOutOfBounds = 0;
  let unplacedWithCoordinates = 0;
  let noShaftWithPoints = 0;

  for (const frame of parsed.frames.values()) {
    let placed = 0;
    for (const name of POINTS) {
      const { x, y, v } = frame.points[name];
      seen.set(v, (seen.get(v) ?? 0) + 1);
      if (v > 0) {
        placed++;
        if (!(x >= 0 && x <= frame.width && y >= 0 && y <= frame.height)) placedOutOfBounds++;
      } else if (x !== 0 || y !== 0) {
        unplacedWithCoordinates++;
      }
    }
    if (frame.numKeypoints !== undefined && frame.numKeypoints !== placed) numKeypointsMismatch++;
    if (frame.attributes.no_shaft === true && placed > 0) noShaftWithPoints++;
  }

  const unknown = [...seen.keys()].filter((v) => ![0, 1, 2].includes(v));
  if (unknown.length > 0) {
    notes.push({
      level: 'fail',
      text: `${parsed.label}: synlighetsvärden utanför {0,1,2}: ${unknown.join(', ')} — mappningen outside/occluded/visible håller inte`,
    });
  } else {
    notes.push({
      level: 'ok',
      text: `${parsed.label}: alla synlighetsvärden ligger i {0,1,2} (v0=${seen.get(0) ?? 0}, v1=${seen.get(1) ?? 0}, v2=${seen.get(2) ?? 0})`,
    });
  }

  if ((seen.get(1) ?? 0) === 0) {
    notes.push({
      level: 'warn',
      text: `${parsed.label}: ingen punkt har v=1 — occluded→1 är OBEKRÄFTAD av den här filen; antingen märktes inget som occluded, eller så skrev CVAT occluded som v=2`,
    });
  }
  if (numKeypointsMismatch > 0) {
    notes.push({
      level: 'fail',
      text: `${parsed.label}: ${numKeypointsMismatch} annotering(ar) där num_keypoints ≠ antalet punkter med v>0 — exportören behandlar inte v>0 som "placerad", så mappningen är fel`,
    });
  } else {
    notes.push({
      level: 'ok',
      text: `${parsed.label}: num_keypoints är lika med antalet v>0 i varje annotering — v≥1 betyder "position placerad", som antaget`,
    });
  }
  if (unplacedWithCoordinates > 0) {
    notes.push({
      level: 'warn',
      text: `${parsed.label}: ${unplacedWithCoordinates} punkt(er) med v=0 bär ändå koordinater ≠ (0,0) — CVAT behåller senaste dragna läget för en outside-punkt, så det är flaggan och aldrig koordinaten som avgör om en punkt räknas`,
    });
  }
  if (placedOutOfBounds > 0) {
    notes.push({
      level: 'warn',
      text: `${parsed.label}: ${placedOutOfBounds} placerad(e) punkt(er) ligger utanför bildens gränser`,
    });
  }
  if (noShaftWithPoints > 0) {
    notes.push({
      level: 'warn',
      text: `${parsed.label}: ${noShaftWithPoints} frame(s) märkta no_shaft=true har ändå en punkt placerad`,
    });
  }
  if (parsed.duplicateAnnotations.length > 0) {
    notes.push({
      level: 'warn',
      text: `${parsed.label}: ${parsed.duplicateAnnotations.length} frame(s) med mer än en shaft-annotering; den första användes (${parsed.duplicateAnnotations.slice(0, 5).join(', ')})`,
    });
  }
  return notes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

/** Compare two parsed exports. See the header for what each block is for. */
export function compare(A, B) {
  const inBoth = [];
  const onlyA = [];
  const onlyB = [];
  for (const id of [...new Set([...A.frames.keys(), ...B.frames.keys()])].sort()) {
    const a = A.frames.get(id);
    const b = B.frames.get(id);
    if (a && b) inBoth.push({ id, a, b });
    else if (a) onlyA.push(id);
    else onlyB.push(id);
  }

  const flags = {};
  const pointCoverage = {};
  const perPoint = {};
  for (const name of POINTS) {
    flags[name] = { matrix: emptyMatrix(), agreed: 0, total: 0 };
    pointCoverage[name] = { both: 0, onlyA: 0, onlyB: 0, neither: 0 };
    perPoint[name] = [];
  }

  const rows = []; // one per frame annotated by both, carrying everything downstream needs
  for (const { id, a, b } of inBoth) {
    const row = { id, width: a.width, height: a.height, points: {}, attributes: {} };

    for (const attr of ATTRIBUTES) {
      row.attributes[attr] = { a: a.attributes[attr], b: b.attributes[attr] };
    }

    for (const name of POINTS) {
      const pa = a.points[name];
      const pb = b.points[name];
      flags[name].matrix[pa.v][pb.v]++;
      flags[name].total++;
      if (pa.v === pb.v) flags[name].agreed++;

      const placedA = pa.v >= 1;
      const placedB = pb.v >= 1;
      if (placedA && placedB) pointCoverage[name].both++;
      else if (placedA) pointCoverage[name].onlyA++;
      else if (placedB) pointCoverage[name].onlyB++;
      else pointCoverage[name].neither++;

      if (placedA && placedB) {
        const px = distance(pa, pb);
        const entry = { px, norm: px / a.height };
        row.points[name] = entry;
        perPoint[name].push(entry);
      }
    }

    // The shaft as a whole — needs both endpoints from BOTH annotators.
    const fullA = POINTS.every((n) => a.points[n].v >= 1);
    const fullB = POINTS.every((n) => b.points[n].v >= 1);
    if (fullA && fullB) {
      const lenA = distance(a.points.butt, a.points.hosel);
      const lenB = distance(b.points.butt, b.points.hosel);
      row.length = {
        a: lenA,
        b: lenB,
        diffPx: Math.abs(lenA - lenB),
        diffNorm: Math.abs(lenA - lenB) / a.height,
        // Relative to the SHORTER of the two: "one of them is 40 % longer" is the
        // sentence that identifies a misplaced endpoint, and dividing by the mean
        // would flatten exactly that.
        diffRatio: Math.min(lenA, lenB) > 0 ? Math.abs(lenA - lenB) / Math.min(lenA, lenB) : null,
      };
      const angA = shaftAngleDeg(a.points.butt, a.points.hosel);
      const angB = shaftAngleDeg(b.points.butt, b.points.hosel);
      row.angle = { a: angA, b: angB, diff: angleDiffDeg(angA, angB) };
    }

    // Rank key for the manual-review list: the worse of the two point deviations,
    // normalised. A frame is worth re-opening if EITHER endpoint is contested.
    const deviations = POINTS.map((n) => row.points[n]?.norm).filter((d) => d !== undefined);
    row.worstNorm = deviations.length > 0 ? Math.max(...deviations) : null;
    rows.push(row);
  }

  const byAttribute = {};
  for (const attr of ATTRIBUTES) {
    const agreedRows = rows.filter((r) => r.attributes[attr].a === r.attributes[attr].b);
    const disagreed = rows
      .filter((r) => r.attributes[attr].a !== r.attributes[attr].b)
      .map((r) => ({ id: r.id, a: r.attributes[attr].a, b: r.attributes[attr].b }));

    // Only frames where BOTH annotators gave the same value are bucketed. Splitting on
    // a label the two disagree about would put one frame in two rows and make every
    // bucket a mixture; the disagreements are reported separately instead.
    const values = [
      ...new Set([...(ATTRIBUTE_VALUES[attr] ?? []), ...agreedRows.map((r) => r.attributes[attr].a)]),
    ].filter((v) => v !== undefined);

    byAttribute[attr] = {
      agreedCount: agreedRows.length,
      total: rows.length,
      disagreed,
      buckets: values
        .map((value) => {
          const bucket = agreedRows.filter((r) => r.attributes[attr].a === value);
          return { value, n: bucket.length, ...bucketStats(bucket) };
        })
        .filter((bucket) => bucket.n > 0),
    };
  }

  const worstLength = rows
    .filter((r) => r.length)
    .sort((x, y) => y.length.diffNorm - x.length.diffNorm)
    .slice(0, WORST_SHAFT_LENGTH);

  const worstOverall = rows
    .filter((r) => r.worstNorm !== null)
    .sort((x, y) => y.worstNorm - x.worstNorm)
    .slice(0, WORST_OVERALL);

  // A shaft pivoted about its midpoint gives a big angle error out of two middling point
  // errors, so the point ranking can hide it. Name those frames separately.
  const angleOnly = rows
    .filter((r) => r.angle)
    .sort((x, y) => y.angle.diff - x.angle.diff)
    .slice(0, WORST_OVERALL)
    .filter((r) => !worstOverall.some((w) => w.id === r.id));

  return {
    labels: { a: A.label, b: B.label },
    coverage: {
      inBoth: inBoth.length,
      onlyA,
      onlyB,
      unannotatedA: A.unannotated,
      unannotatedB: B.unannotated,
      imagesA: A.imageCount,
      imagesB: B.imageCount,
    },
    flags,
    pointCoverage,
    distances: Object.fromEntries(
      POINTS.map((n) => [
        n,
        { px: summarize(perPoint[n].map((e) => e.px)), norm: summarize(perPoint[n].map((e) => e.norm)) },
      ]),
    ),
    angle: summarize(rows.filter((r) => r.angle).map((r) => r.angle.diff)),
    length: summarize(rows.filter((r) => r.length).map((r) => r.length.diffNorm)),
    byAttribute,
    worstLength,
    worstOverall,
    angleOnly,
    rows,
  };
}

/** Distance + angle summaries for one bucket of frames. */
function bucketStats(bucket) {
  const out = { angle: summarize(bucket.filter((r) => r.angle).map((r) => r.angle.diff)) };
  for (const name of POINTS) {
    const entries = bucket.map((r) => r.points[name]).filter(Boolean);
    out[name] = { px: summarize(entries.map((e) => e.px)), norm: summarize(entries.map((e) => e.norm)) };
  }
  return out;
}

function emptyMatrix() {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

const px = (v) => (v === null || v === undefined ? '–' : v.toFixed(1));
const pctH = (v) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(2)} %`);
const deg = (v) => (v === null || v === undefined ? '–' : `${v.toFixed(1)}°`);
const pct = (n, total) => (total === 0 ? '–' : `${((n / total) * 100).toFixed(1)} %`);

/** `median | p90 | max` cells for a summary, in both units. */
function statCells(stat) {
  return [px(stat.px.median), px(stat.px.p90), px(stat.px.max), pctH(stat.norm.median), pctH(stat.norm.p90), pctH(stat.norm.max)];
}

export function agreementMarkdown(result, meta) {
  const { a: A, b: B } = result.labels;
  const c = result.coverage;
  const L = [];

  L.push('# Kalibrering — annotatörssamstämmighet', '');
  L.push(
    `Genererat av \`scripts/measure-calibration.mjs\`. **Redigera inte för hand** — kör om`,
    'skriptet. Mätningen görs **före** produktionsannotering; setet är därefter permanent',
    'evalset (se docs/shaft/annotation-spec.md → *Kalibreringsset*).',
    '',
  );
  L.push(`- Annotatörer: **${A}** vs **${B}**`);
  L.push(`- Källor: \`${meta.relA}\` · \`${meta.relB}\``);
  L.push(`- Genererat: ${meta.generatedAt}`);
  L.push(
    '- Avstånd redovisas i **px** och **normaliserat mot bildhöjden** (`px / height`).',
    '  Setet blandar 720×818 och 1080×1920 — px är inte jämförbart mellan frames, den',
    '  normaliserade siffran är den att läsa.',
    '',
  );

  // ── 0 ─────────────────────────────────────────────────────────────────────
  L.push('## 0. Verifiering av synlighetskodningen', '');
  L.push(
    'COCO kodar `v=0` (ej annoterad), `v=1` (annoterad men ej synlig), `v=2` (synlig);',
    'CVAT förväntas skriva `outside`→0 och `occluded`→1. Kontrollerat mot filernas',
    'faktiska innehåll:',
    '',
  );
  const icon = { ok: '✅', warn: '⚠️', fail: '❌' };
  for (const note of meta.visibilityNotes) L.push(`- ${icon[note.level]} ${note.text}`);
  const failed = meta.visibilityNotes.some((n) => n.level === 'fail');
  L.push(
    '',
    failed
      ? '**Mappningen stämmer inte** — siffrorna nedan är beräknade under antagandet ändå och ska inte litas på förrän detta är utrett.'
      : '**Mappningen stämmer** så långt filerna kan visa det. `v≥1` = position placerad, och det är det villkoret alla avståndsmått nedan använder.',
    '',
  );

  // ── 1 ─────────────────────────────────────────────────────────────────────
  L.push('## 1. Täckning', '');
  L.push('| | Antal |', '|---|---:|');
  L.push(`| Frames båda annoterat | **${c.inBoth}** |`);
  L.push(`| Endast ${A} | ${c.onlyA.length} |`);
  L.push(`| Endast ${B} | ${c.onlyB.length} |`);
  L.push(`| Bilder i ${A}:s task | ${c.imagesA} (varav ${c.unannotatedA.length} utan annotering) |`);
  L.push(`| Bilder i ${B}:s task | ${c.imagesB} (varav ${c.unannotatedB.length} utan annotering) |`);
  L.push('');
  for (const [label, ids] of [[`Endast ${A}`, c.onlyA], [`Endast ${B}`, c.onlyB], [`${A}: bild utan annotering`, c.unannotatedA], [`${B}: bild utan annotering`, c.unannotatedB]]) {
    if (ids.length > 0) L.push(`- ${label}: ${ids.slice(0, 20).map((i) => `\`${i}\``).join(', ')}${ids.length > 20 ? ` … +${ids.length - 20}` : ''}`);
  }
  L.push('');
  L.push('Per punkt — där en frame båda annoterat ändå bara har en placerad position:', '');
  L.push(`| Punkt | Båda placerat | Endast ${A} | Endast ${B} | Ingen (outside hos båda) |`, '|---|---:|---:|---:|---:|');
  for (const name of POINTS) {
    const p = result.pointCoverage[name];
    L.push(`| \`${name}\` | ${p.both} | ${p.onlyA} | ${p.onlyB} | ${p.neither} |`);
  }
  L.push('');

  // ── 2 ─────────────────────────────────────────────────────────────────────
  L.push('## 2. Flaggsamstämmighet', '');
  L.push(
    'Samma synlighetsklass, per punkt. En flaggoenighet är en oenighet om huruvida punkten',
    'är *bedömbar* — den sitter uppströms om, och väger tyngre än, några pixlars spridning.',
    '',
  );
  for (const name of POINTS) {
    const f = result.flags[name];
    L.push(`**\`${name}\`** — samma klass i ${f.agreed}/${f.total} frames (${pct(f.agreed, f.total)}).`, '');
    L.push(`| ${A} ↓ / ${B} → | ${VISIBILITY.map((v) => `\`${v}\``).join(' | ')} | Σ |`, '|---|---:|---:|---:|---:|');
    for (let i = 0; i < 3; i++) {
      const row = f.matrix[i];
      const cells = row.map((n, j) => (i === j ? `**${n}**` : String(n)));
      L.push(`| \`${VISIBILITY[i]}\` | ${cells.join(' | ')} | ${row.reduce((s, n) => s + n, 0)} |`);
    }
    const colSums = [0, 1, 2].map((j) => f.matrix.reduce((s, row) => s + row[j], 0));
    L.push(`| **Σ** | ${colSums.join(' | ')} | ${f.total} |`, '');
  }

  // ── 3 ─────────────────────────────────────────────────────────────────────
  L.push('## 3. Avstånd mellan placerade punkter', '');
  L.push('Endast punkter där **båda** placerat en position (`v≥1`).', '');
  L.push('| Punkt | n | Median px | p90 px | Max px | Median %H | p90 %H | Max %H |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const name of POINTS) {
    const d = result.distances[name];
    L.push(`| \`${name}\` | ${d.px.n} | ${statCells(d).join(' | ')} |`);
  }
  L.push('');
  L.push(
    '> Specens målvärde är **medianavvikelse < 0,5 skaftbredd**. Skaftbredden är inte',
    '> annoterad — 2-punktsschemat bär ingen bredd — så den tröskeln går inte att utvärdera',
    '> här. Siffrorna ovan är i px och bildhöjd; kopplingen till skaftbredder får göras för',
    '> hand på ett par frames tills en bredduppskattning finns.',
    '',
  );

  // ── 4 ─────────────────────────────────────────────────────────────────────
  L.push('## 4. Uppdelat per frame-attribut', '');
  L.push(
    'Attributen är satta av annotatörerna själva, alltså en egen källa till oenighet.',
    'Bara frames där **båda satt samma värde** hamnar i en hink — annars skulle samma frame',
    'ligga i två rader och varje hink bli en blandning. Oenigheterna redovisas separat.',
    '',
  );
  for (const attr of ATTRIBUTES) {
    const info = result.byAttribute[attr];
    L.push(`### \`${attr}\` — samma värde i ${info.agreedCount}/${info.total} frames (${pct(info.agreedCount, info.total)})`, '');
    if (info.agreedCount < info.total * ATTRIBUTE_AGREEMENT_FLOOR) {
      // Worth saying out loud: with a third of the frames dropped the buckets get small,
      // and a bucket of six is not evidence about a phase. The uppdelning is then a
      // finding about the ATTRIBUTE, not about placement in that phase.
      L.push(
        `> ⚠️ Under ${(ATTRIBUTE_AGREEMENT_FLOOR * 100).toFixed(0)} % enighet om \`${attr}\` självt. ` +
          `${info.disagreed.length} frames faller ur uppdelningen och hinkarna nedan blir tunna — ` +
          `läs dem som indikationer, inte som mätvärden. Den egentliga slutsatsen är att \`${attr}\` ` +
          'behöver en skarpare definition i specen innan produktionsannoteringen börjar.',
        '',
      );
    }
    L.push(
      '| Värde | n | butt median %H | butt p90 %H | hosel median %H | hosel p90 %H | vinkel median | vinkel p90 |',
      '|---|---:|---:|---:|---:|---:|---:|---:|',
    );
    for (const b of info.buckets) {
      L.push(
        `| \`${b.value}\` | ${b.n} | ${pctH(b.butt.norm.median)} | ${pctH(b.butt.norm.p90)} | ` +
          `${pctH(b.hosel.norm.median)} | ${pctH(b.hosel.norm.p90)} | ${deg(b.angle.median)} | ${deg(b.angle.p90)} |`,
      );
    }
    L.push('');
    if (info.disagreed.length > 0) {
      L.push(`Oeniga om \`${attr}\` (${info.disagreed.length} st):`, '');
      L.push(`| Frame | ${A} | ${B} |`, '|---|---|---|');
      for (const d of info.disagreed) L.push(`| \`${d.id}\` | \`${d.a}\` | \`${d.b}\` |`);
      L.push('');
    }
  }

  // ── 5 ─────────────────────────────────────────────────────────────────────
  L.push('## 5. Skaftlängd — rimlighetskontroll', '');
  L.push(
    'Avståndet butt–hosel per annotatör, för frames där båda placerat **båda** punkterna.',
    'Stor skillnad på samma frame betyder inte några pixlars spridning utan att någon satt en',
    'ändpunkt på fel sak — händerna i stället för greppets ände, klubbhuvudets centrum i',
    'stället för hoseln. `Δ%` är relativt den **kortare** av de två längderna.',
    '',
  );
  L.push(`Skillnad i skaftlängd, alla ${result.length.n} frames: median ${pctH(result.length.median)} av bildhöjden, p90 ${pctH(result.length.p90)}, max ${pctH(result.length.max)}.`, '');
  L.push(`De ${WORST_SHAFT_LENGTH} värsta:`, '');
  L.push(`| # | Frame | fas | ${A} px | ${B} px | Δ px | Δ %H | Δ% |`, '|---:|---|---|---:|---:|---:|---:|---:|');
  result.worstLength.forEach((r, i) => {
    L.push(
      `| ${i + 1} | \`${r.id}\` | ${phaseCell(r)} | ${px(r.length.a)} | ${px(r.length.b)} | ` +
        `${px(r.length.diffPx)} | ${pctH(r.length.diffNorm)} | ${r.length.diffRatio === null ? '–' : `${(r.length.diffRatio * 100).toFixed(0)} %`} |`,
    );
  });
  L.push('');

  // ── 6 ─────────────────────────────────────────────────────────────────────
  L.push('## 6. Vinkelavvikelse', '');
  L.push(
    'Skaftets riktning, `atan2` från butt till hosel, per annotatör; skillnaden är det',
    'minsta vinkelavståndet i [0°, 180°]. **Det här är måttet som betyder något för',
    'produkten** — reglerna mäter vinklar, så en punkt som ligger fel *längs* skaftet kostar',
    'ingenting medan samma fel *tvärs* skaftet kostar en regel. Vinkeln viks inte vid 90°:',
    'ombytta ändpunkter ska synas som ~180°, inte försvinna som 0°.',
    '',
  );
  L.push('| Urval | n | Median | p90 | Max |', '|---|---:|---:|---:|---:|');
  L.push(`| Totalt | ${result.angle.n} | ${deg(result.angle.median)} | ${deg(result.angle.p90)} | ${deg(result.angle.max)} |`);
  for (const b of result.byAttribute.phase.buckets) {
    L.push(`| \`phase=${b.value}\` | ${b.angle.n} | ${deg(b.angle.median)} | ${deg(b.angle.p90)} | ${deg(b.angle.max)} |`);
  }
  L.push('');

  // ── 7 ─────────────────────────────────────────────────────────────────────
  L.push('## 7. Topplista för manuell granskning', '');
  L.push(
    `De ${WORST_OVERALL} frames med störst punktavvikelse — rankade på den *sämsta* av de två`,
    'punkterna, normaliserat mot bildhöjden, eftersom en frame är värd att öppna igen om',
    'endera ändpunkten är omtvistad.',
    '',
  );
  L.push('| # | Frame | fas | vy | blur | butt %H | hosel %H | Δvinkel |', '|---:|---|---|---|---|---:|---:|---:|');
  result.worstOverall.forEach((r, i) => {
    L.push(
      `| ${i + 1} | \`${r.id}\` | ${phaseCell(r)} | ${attrCell(r, 'view')} | ${attrCell(r, 'blur')} | ` +
        `${pctH(r.points.butt?.norm)} | ${pctH(r.points.hosel?.norm)} | ${deg(r.angle?.diff)} |`,
    );
  });
  L.push('');
  if (result.angleOnly.length > 0) {
    L.push(
      `Dessutom bland de ${WORST_OVERALL} värsta på **vinkel** utan att synas ovan (skaftet vridet`,
      'kring sin mittpunkt ger stor vinkelavvikelse ur två medelmåttiga punktfel):',
      '',
    );
    for (const r of result.angleOnly) L.push(`- \`${r.id}\` — ${deg(r.angle.diff)} (${phaseCell(r)})`);
    L.push('');
  }

  return L.join('\n') + '\n';
}

/** Attribute cell that shows the disagreement rather than silently picking one side. */
function attrCell(row, attr) {
  const { a, b } = row.attributes[attr];
  return a === b ? `\`${a ?? '?'}\`` : `\`${a ?? '?'}\`/\`${b ?? '?'}\``;
}
const phaseCell = (row) => attrCell(row, 'phase');

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function assertInsideDataShaft(target) {
  const resolved = path.resolve(target);
  const rel = path.relative(WRITE_ROOT, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to write outside data/shaft/: ${resolved}`);
  }
  return resolved;
}

function parseArgs(argv) {
  const opts = { a: DEFAULT_A, b: DEFAULT_B, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--a') opts.a = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--b') opts.b = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--out') opts.out = path.resolve(ROOT, argv[++i] ?? '');
    else if (!arg.startsWith('--') && i === 0) opts.a = path.resolve(ROOT, arg);
    else if (!arg.startsWith('--') && i === 1) opts.b = path.resolve(ROOT, arg);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

/** Annotator label = the export's basename. `erik.zip` → `erik`. */
const labelFor = (file) => path.basename(file).replace(/\.zip$/i, '');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

function main(argv) {
  const opts = parseArgs(argv);

  const A = readExport(opts.a, labelFor(opts.a));
  const B = readExport(opts.b, labelFor(opts.b));
  console.log(`Read ${rel(opts.a)} (${A.frames.size} annotated frames) and ${rel(opts.b)} (${B.frames.size}).`);

  const visibilityNotes = [...verifyVisibility(A), ...verifyVisibility(B)];
  for (const note of visibilityNotes) {
    if (note.level !== 'ok') console.warn(`  ${note.level.toUpperCase()}: ${note.text}`);
  }
  if (visibilityNotes.some((n) => n.level === 'fail')) {
    console.error('\nVisibility mapping check FAILED — the report is written anyway, but read section 0 first.');
    process.exitCode = 1;
  }

  const result = compare(A, B);
  printSummary(result);

  if (opts.dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }
  const md = agreementMarkdown(result, {
    relA: rel(opts.a),
    relB: rel(opts.b),
    generatedAt: new Date().toISOString(),
    visibilityNotes,
  });
  const outFile = assertInsideDataShaft(opts.out);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, md);
  console.log(`\nWrote: ${rel(outFile)}`);
}

function printSummary(result) {
  const { a: A, b: B } = result.labels;
  const c = result.coverage;
  console.log(`\n${A} vs ${B}`);
  console.log(`  Coverage   ${c.inBoth} frames annotated by both; ${c.onlyA.length} only ${A}, ${c.onlyB.length} only ${B}`);
  for (const name of POINTS) {
    const f = result.flags[name];
    const p = result.pointCoverage[name];
    console.log(`  ${name.padEnd(6)}     flag agreement ${f.agreed}/${f.total} (${pct(f.agreed, f.total)}); both placed ${p.both}, one-sided ${p.onlyA + p.onlyB}`);
  }
  for (const name of POINTS) {
    const d = result.distances[name];
    console.log(`  ${name.padEnd(6)}     median ${px(d.px.median)} px (${pctH(d.norm.median)} of height), p90 ${px(d.px.p90)} px (${pctH(d.norm.p90)}), max ${px(d.px.max)} px`);
  }
  console.log(`  Angle      median ${deg(result.angle.median)}, p90 ${deg(result.angle.p90)}, max ${deg(result.angle.max)} over ${result.angle.n} frames`);

  // The two buckets the spec predicts will be the bad ones — surfaced without scrolling.
  for (const [attr, value] of [['phase', 'downswing'], ['blur', 'severe']]) {
    const b = result.byAttribute[attr].buckets.find((x) => x.value === value);
    if (b) {
      console.log(`  ${attr}=${value.padEnd(9)} n=${b.n}: butt ${pctH(b.butt.norm.median)}, hosel ${pctH(b.hosel.norm.median)}, angle ${deg(b.angle.median)} (medians)`);
    }
  }
  for (const attr of ATTRIBUTES) {
    const info = result.byAttribute[attr];
    if (info.disagreed.length > 0) console.log(`  Attr       ${attr}: annotators disagree on ${info.disagreed.length}/${info.total} frames`);
  }
  const worst = result.worstOverall[0];
  if (worst) console.log(`  Worst      ${worst.id} — ${pctH(worst.worstNorm)} of height, ${deg(worst.angle?.diff)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
