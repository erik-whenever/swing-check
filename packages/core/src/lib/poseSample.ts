// The pose time series every pose-chain pass reads (envelope, segmentation, crop, ring
// buffer). Lives here, not next to the MediaPipe runner that produces it, so the chain
// can be shared with the native app (F6) without importing a web runtime.

/**
 * One pose landmark in normalized [0, 1] image coordinates. Structurally identical to
 * MediaPipe's `NormalizedLandmark` — same name, same fields — so the web runner's output
 * is assignable without a cast. Copied rather than imported: importing it would make
 * this package depend on `@mediapipe/tasks-vision`.
 */
export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  /** The likelihood of the landmark being visible within the image. */
  visibility: number;
}

export interface PoseSample {
  /** Timestamp in seconds (relative to the start of the clip). */
  t: number;
  /** All 33 MediaPipe pose landmarks, or [] if no pose was detected. */
  landmarks: NormalizedLandmark[];
}
