import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'

/** Which MediaPipe Pose Landmarker model to load. The web runs `lite`; N-2 measured both. */
export type PoseModel = 'lite' | 'full'

/**
 * One landmark in normalized [0, 1] image coordinates, already rotated to upright.
 * Same fields as core's `NormalizedLandmark`, so a result maps to a `PoseSample` without
 * a conversion step.
 */
export interface PoseLandmark {
  x: number
  y: number
  z: number
  visibility: number
}

export interface PoseFrameResult {
  /** The frame's presentation timestamp, as VisionCamera reports it. */
  timestamp: number
  /** All 33 landmarks, or empty when no pose was found. */
  landmarks: PoseLandmark[]
  /** Time spent inside MediaPipe for this frame, ms. */
  inferenceMs: number
}

/**
 * MediaPipe Pose on the camera thread. One interface for both platforms: Kotlin
 * (MediaPipe Tasks for Android) and Swift (MediaPipe Tasks for iOS). ADR-0004.
 */
export interface PoseDetector
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Loads the model in VIDEO mode. Calling it again with another model swaps it. */
  load(model: PoseModel): void
  /** Runs synchronously on the frame-processor thread. */
  detect(frame: Frame): PoseFrameResult
  /**
   * Loads the native MediaPipe library and names it. A debug check that the runtime is
   * linked and loadable in this binary, nothing more.
   */
  runtimeInfo(): string
}
