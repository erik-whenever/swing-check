import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'

// The N-3.2 spec, taken from pose-android.md §6 (ADR-0004, tillägget). One interface for both
// platforms: Kotlin (MediaPipe Tasks for Android) now, Swift (MediaPipe Tasks for iOS) in N-3.8.
// Nothing here is Android-specific: time is in seconds, and coordinates are upright and
// unmirrored on both platforms.

export type PoseModel = 'lite' | 'full'
export type PoseDelegate = 'gpu' | 'cpu'
export type PoseStatus = 'ok' | 'no-pose' | 'error'

export interface PoseConfig {
  model: PoseModel
  /** Requested delegate. 'gpu' falls back to 'cpu' if the build fails. */
  delegate: PoseDelegate
}

export interface PoseResult {
  status: PoseStatus
  /**
   * The frame's time on the camera clock, in SECONDS on both platforms
   * (Android: ImageInfo.timestamp ns / 1e9, iOS: CMSampleBuffer PTS). Diagnostics only:
   * PoseSample.t is the t that capture.append(frame) returns for the same frame (ADR-0004).
   */
  frameTimeSec: number
  /**
   * Float32 × 132: [x, y, z, visibility] for MediaPipe's 33 landmarks in index order.
   * x, y are normalized to the UPRIGHT, UNMIRRORED image (same as the web's <video>).
   * Always 528 bytes. The contents are undefined unless status === 'ok'.
   */
  landmarks: ArrayBuffer
  /** Android: YUV → downscaled, rotated RGBA (libyuv), ms. iOS: 0 (MPImage directly on BGRA). */
  convertMs: number
  /** detectForVideo alone, ms. */
  inferenceMs: number
  /** All of detect(), including conversion, MPImage wrapping and packing, ms. */
  totalMs: number
  /** The delegate that actually ran. */
  delegate: PoseDelegate
  /** The buffer's rotation (0/90/180/270), which the module rotated away in the conversion. */
  rotationDegrees: number
}

export interface PoseDetector
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Stores the choice. The landmarker is built on the next detect(), on the camera thread. */
  configure(config: PoseConfig): void
  /**
   * One inference on the frame, synchronously. NEVER throws per frame, returns status 'error'
   * instead. Throws only if configure() has not been called. The caller owns the frame (dispose
   * afterwards).
   */
  detect(frame: Frame): PoseResult
  /** Number of rebuilds (config, thread change, time base going backwards): diagnostics. */
  readonly rebuilds: number
  /** Releases the landmarker. The next detect() rebuilds it. */
  reset(): void
  /**
   * Loads the native MediaPipe library and names it. A debug check that the runtime is linked
   * and loadable in this binary (ADR-0004: every module has one).
   */
  runtimeInfo(): string
}
