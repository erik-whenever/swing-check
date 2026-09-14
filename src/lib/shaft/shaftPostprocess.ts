// Decode + NMS for the shaft detector's raw ONNX output.
//
// Kept separate from `shaftDetector.ts` — and pure — because everything here can be
// checked against a hand-built Float32Array, while the detector needs a WASM
// runtime, a canvas and a 12 MB model file. The parts most likely to be wrong (the
// channel layout, the threshold semantics, IoU) are therefore the parts that are
// unit-tested.
//
// INPUT LAYOUT (training/README.md → "Utdataformat"): the graph emits
// `[1, C, N]` float32, channel-major, so channel `c` of anchor `i` lives at
// `data[c * N + i]`. N = 18 900 for imgsz 960. Ultralytics exports WITHOUT NMS
// (`dynamic=False`), so steps 3–6 of the README's integration list are ours:
//
//   0..3   cx, cy, w, h      box, MODEL pixels
//   4      conf              sigmoid-activated, [0, 1]
//   5..7   butt   x, y, v
//   8..10  hosel  x, y, v
//   11..13 toe    x, y, v    ← 4-point schema only
//   14..16 heel   x, y, v    ← 4-point schema only
//
// TWO LAYOUTS ARE READ, ONE IS THE SCHEMA. The annotation schema has four points
// (docs/shaft/annotation-spec.md), so `C = 17`. Every checkpoint trained before that
// — `shaft-v2.onnx` included, which is what ships today — emits `C = 11` with no toe
// and no heel. The decoder accepts both and reports the missing points as `null`
// rather than as coordinates at the origin, because a point the model cannot produce
// is the same thing as a point the model did not locate: absent, not at (0, 0).
// Anything other than 11 or 17 is a different model and throws.
//
// Coordinates stay in MODEL space here. The caller maps them back through
// `letterbox.modelToImage`; doing it in two places is how the padding gets
// subtracted once and forgotten once.

/** Box confidence below this is not a club. README's suggested starting point. */
export const CONF_THRESHOLD = 0.25;
/** Keypoint visibility below this is reported as "not located" rather than guessed. */
export const KEYPOINT_THRESHOLD = 0.5;
/**
 * IoU above which two boxes are the same club. Ultralytics' predict default; the
 * value barely matters for this model (see `selectBest`) but the suppression still
 * runs, so a future multi-club frame does not silently return two overlapping
 * halves of one detection.
 */
export const IOU_THRESHOLD = 0.45;

/**
 * Keypoint order, fixed by docs/shaft/annotation-spec.md and identical in the CVAT
 * sublabels, the COCO export, the YOLO label columns and the channels above.
 */
export const KEYPOINT_NAMES = ['butt', 'hosel', 'toe', 'heel'] as const;
export type KeypointName = (typeof KEYPOINT_NAMES)[number];

/** Box (cx, cy, w, h) plus objectness. Everything after these is keypoints. */
const BOX_CHANNELS = 5;
/** Per keypoint: x, y, visibility. */
const CHANNELS_PER_KEYPOINT = 3;

/** Channels the 4-point schema emits: 5 + 4 × 3. */
export const CHANNELS = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * KEYPOINT_NAMES.length;
/** Channels every pre-2026-09 checkpoint emits: 5 + 2 × 3. `shaft-v2.onnx` is one. */
export const LEGACY_CHANNELS = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * 2;
/** Every channel count this decoder knows how to read, widest first. */
export const SUPPORTED_CHANNELS: readonly number[] = [CHANNELS, LEGACY_CHANNELS];

export interface RawKeypoint {
  x: number;
  y: number;
  /** Sigmoid-activated visibility score, [0, 1]. */
  score: number;
}

export interface Candidate {
  /** Box in model pixels, corner form. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf: number;
  butt: RawKeypoint;
  hosel: RawKeypoint;
  /** Null when the graph carries no toe channel — a legacy 2-point model. */
  toe: RawKeypoint | null;
  /** Null when the graph carries no heel channel — a legacy 2-point model. */
  heel: RawKeypoint | null;
}

/**
 * How many keypoints a `[1, C, N]` output carries, or null when `C` is neither
 * layout this decoder reads.
 */
export function keypointCountForChannels(channels: number): number | null {
  if (!SUPPORTED_CHANNELS.includes(channels)) return null;
  return (channels - BOX_CHANNELS) / CHANNELS_PER_KEYPOINT;
}

/**
 * Every anchor whose box confidence clears `confThreshold`, converted from
 * centre-form to corner-form. Unsorted — `nms` sorts.
 *
 * The channel count is derived from `data.length / numAnchors`, not assumed: that is
 * the one number that says which schema the loaded model implements, and reading it
 * off the buffer is what lets a 2-point checkpoint and a 4-point one go through the
 * same path without a flag being passed around and getting out of date.
 */
export function decodeCandidates(
  data: Float32Array | number[],
  numAnchors: number,
  confThreshold = CONF_THRESHOLD,
): Candidate[] {
  if (numAnchors <= 0 || data.length % numAnchors !== 0) {
    throw new Error(
      `Output length ${data.length} is not a whole number of channels × ${numAnchors} — wrong model?`,
    );
  }
  const channels = data.length / numAnchors;
  const keypoints = keypointCountForChannels(channels);
  if (keypoints === null) {
    throw new Error(
      `Output length ${data.length} implies ${channels} channels × ${numAnchors} anchors; ` +
        `expected ${CHANNELS} (4-point) or ${LEGACY_CHANNELS} (legacy 2-point) — wrong model?`,
    );
  }

  const at = (channel: number, i: number) => data[channel * numAnchors + i];
  const keypointAt = (index: number, i: number): RawKeypoint | null => {
    if (index >= keypoints) return null;
    const base = BOX_CHANNELS + CHANNELS_PER_KEYPOINT * index;
    return { x: at(base, i), y: at(base + 1, i), score: at(base + 2, i) };
  };

  const out: Candidate[] = [];
  for (let i = 0; i < numAnchors; i++) {
    const conf = at(4, i);
    if (conf < confThreshold) continue;
    const cx = at(0, i);
    const cy = at(1, i);
    const halfW = at(2, i) / 2;
    const halfH = at(3, i) / 2;
    out.push({
      x1: cx - halfW,
      y1: cy - halfH,
      x2: cx + halfW,
      y2: cy + halfH,
      conf,
      // butt and hosel exist in every layout this decoder accepts, so the non-null
      // assertion is the schema's guarantee, not an optimistic guess.
      butt: keypointAt(0, i)!,
      hosel: keypointAt(1, i)!,
      toe: keypointAt(2, i),
      heel: keypointAt(3, i),
    });
  }
  return out;
}

/** Intersection over union of two corner-form boxes. Zero when they do not overlap. */
export function iou(a: Candidate, b: Candidate): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const overlap = w * h;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Greedy non-maximum suppression, highest confidence first. */
export function nms(candidates: Candidate[], iouThreshold = IOU_THRESHOLD): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.conf - a.conf);
  const kept: Candidate[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => iou(k, candidate) <= iouThreshold)) kept.push(candidate);
  }
  return kept;
}

/**
 * The one club in the frame, or null.
 *
 * NMS runs first even though the answer is "highest confidence" either way: the
 * suppressed list is the honest thing to log and to reason about, and picking the
 * argmax off a raw 18 900-anchor grid would hide the case where the model has
 * genuinely found two clubs (a second golfer in shot) behind a single number.
 */
export function selectBest(
  data: Float32Array | number[],
  numAnchors: number,
  options: { confThreshold?: number; iouThreshold?: number } = {},
): { best: Candidate | null; kept: number; candidates: number } {
  const candidates = decodeCandidates(data, numAnchors, options.confThreshold);
  const kept = nms(candidates, options.iouThreshold);
  return { best: kept[0] ?? null, kept: kept.length, candidates: candidates.length };
}
