import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'

/**
 * The letterbox the native side drew the frame into. Same fields as core's
 * `LetterboxTransform`, so core's `modelToImage` maps the points back to the source.
 */
export interface ShaftLetterbox {
  size: number
  scale: number
  padX: number
  padY: number
  drawWidth: number
  drawHeight: number
}

export interface ShaftFrameResult {
  /**
   * The model's raw output, float32 `[1, channels, numAnchors]` (shaft-v2: 11 × 18 900).
   * Decoding and NMS stay in core (`shaftPostprocess`), so both platforms share them.
   */
  output: ArrayBuffer
  numAnchors: number
  letterbox: ShaftLetterbox
  /** Width and height of the upright source the letterbox was computed from, px. */
  sourceWidth: number
  sourceHeight: number
  /** Rotation, colour order and letterbox, ms. */
  preprocessMs: number
  /** The model run alone, ms. */
  inferenceMs: number
}

/**
 * shaft-v2 on a camera frame. One interface for both platforms: Kotlin (LiteRT with
 * the GPU delegate) and Swift (Core ML directly, no TFLite). ADR-0004.
 */
export interface ShaftDetector
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Loads the model from a local file path. */
  load(modelPath: string): void
  /** Prepares the frame natively and runs the model. Synchronous, on the calling thread. */
  detect(frame: Frame): ShaftFrameResult
  /**
   * Loads the native inference library and names it. A debug check that the runtime is
   * linked and loadable in this binary, nothing more.
   */
  runtimeInfo(): string
}
