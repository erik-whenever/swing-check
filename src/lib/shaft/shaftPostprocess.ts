// Decode + NMS for the shaft detector's raw ONNX output.
//
// Kept separate from `shaftDetector.ts` — and pure — because everything here can be
// checked against a hand-built Float32Array, while the detector needs a WASM
// runtime, a canvas and a 12 MB model file. The parts most likely to be wrong (the
// channel layout, the threshold semantics, IoU) are therefore the parts that are
// unit-tested.
//
// INPUT LAYOUT (training/README.md → "Utdataformat"): the graph emits
// `[1, 11, N]` float32, channel-major, so channel `c` of anchor `i` lives at
// `data[c * N + i]`. N = 18 900 for imgsz 960. Ultralytics exports WITHOUT NMS
// (`dynamic=False`), so steps 3–6 of the README's integration list are ours:
//
//   0..3   cx, cy, w, h      box, MODEL pixels
//   4      conf              sigmoid-activated, [0, 1]
//   5..7   butt   x, y, v
//   8..10  hosel  x, y, v
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

/** Channels per anchor in the exported graph. A different value means a different model. */
export const CHANNELS = 11;

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
}

/**
 * Every anchor whose box confidence clears `confThreshold`, converted from
 * centre-form to corner-form. Unsorted — `nms` sorts.
 */
export function decodeCandidates(
  data: Float32Array | number[],
  numAnchors: number,
  confThreshold = CONF_THRESHOLD,
): Candidate[] {
  if (data.length !== CHANNELS * numAnchors) {
    throw new Error(
      `Output length ${data.length} is not ${CHANNELS} × ${numAnchors} — wrong model?`,
    );
  }
  const at = (channel: number, i: number) => data[channel * numAnchors + i];
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
      butt: { x: at(5, i), y: at(6, i), score: at(7, i) },
      hosel: { x: at(8, i), y: at(9, i), score: at(10, i) },
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
