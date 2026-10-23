// Letterbox geometry for the shaft detector — the image ⇄ model coordinate map.
//
// WHY LETTERBOX AND NOT A PLAIN STRETCH. `training/README.md` describes the input
// tensor as "scaled to imgsz × imgsz with bilinear interpolation", and
// `export_onnx.py` does exactly that — but that stretch exists only to feed the
// SAME array to PyTorch and to ONNX so the two can be compared element-wise. It is
// a numerical-equivalence harness, not the accuracy path. The accuracy path is
// `evaluate.py`, which calls `model.predict(...)`, and Ultralytics' predictor
// pre-transform is `LetterBox` — aspect preserved, centred, padded with the
// constant 114 grey. Training goes through the same LetterBox. Feeding a stretched
// frame instead would put a 1080×1920 phone clip through a 1.78× horizontal squash
// the model has never seen, and the shaft ANGLE — the number the rules are built
// on — is precisely what a non-uniform scale destroys.
//
// So the numbers below mirror Ultralytics' LetterBox with `scaleup=True`,
// `center=True`, including its `round(pad - 0.1)` rounding, so a shaft that lands
// on pixel column 640 in Python lands on pixel column 640 here.
//
// The inverse map is the classic place this whole chain goes quietly wrong: the
// model returns coordinates in the padded 960×960 square, and a caller that forgets
// to subtract the padding gets points that are plausible, stable, and wrong by the
// pad width. Hence `modelToImage` is a named function with a round-trip test
// (letterbox.test.ts) rather than two lines inlined at the call site.

/** Grey Ultralytics pads with, 0–255. Not black: 114 is what the model trained on. */
export const PAD_VALUE = 114;

export interface LetterboxTransform {
  /** Side of the square model input, px. */
  size: number;
  /** Uniform image→model scale factor (`min(size/w, size/h)`; may exceed 1). */
  scale: number;
  /** Left padding inside the square, px. */
  padX: number;
  /** Top padding inside the square, px. */
  padY: number;
  /** Size the source is drawn at inside the square, px. */
  drawWidth: number;
  drawHeight: number;
}

/**
 * Geometry for fitting a `srcWidth × srcHeight` image into a `size × size` square
 * with the aspect ratio preserved and the remainder padded evenly.
 */
export function computeLetterbox(
  srcWidth: number,
  srcHeight: number,
  size: number,
): LetterboxTransform {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new Error(`Invalid source size ${srcWidth}×${srcHeight}`);
  }
  const scale = Math.min(size / srcWidth, size / srcHeight);
  const drawWidth = Math.round(srcWidth * scale);
  const drawHeight = Math.round(srcHeight * scale);
  // Ultralytics halves the leftover and rounds with a -0.1 nudge, which sends an
  // exact .5 down rather than up. Copied rather than "cleaned up": a one-pixel
  // disagreement with Python is exactly the kind of drift this module exists to
  // prevent.
  // `max(0, …)` is not defensive padding-clamping — the leftover can never be
  // negative — it exists to turn `Math.round(-0.1)`'s negative zero into a plain 0,
  // which would otherwise travel into every coordinate and every log line.
  const padX = Math.max(0, Math.round((size - drawWidth) / 2 - 0.1));
  const padY = Math.max(0, Math.round((size - drawHeight) / 2 - 0.1));
  return { size, scale, padX, padY, drawWidth, drawHeight };
}

export interface Point {
  x: number;
  y: number;
}

/** Image pixel → model pixel (inside the padded square). */
export function imageToModel(t: LetterboxTransform, p: Point): Point {
  return { x: p.x * t.scale + t.padX, y: p.y * t.scale + t.padY };
}

/**
 * Model pixel → image pixel. The one that matters: every coordinate the ONNX
 * graph emits — box centres and both keypoints — must pass through here before it
 * is drawn on, or compared against, the source frame.
 */
export function modelToImage(t: LetterboxTransform, p: Point): Point {
  return { x: (p.x - t.padX) / t.scale, y: (p.y - t.padY) / t.scale };
}
