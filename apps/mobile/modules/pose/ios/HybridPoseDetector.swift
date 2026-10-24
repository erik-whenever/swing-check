import NitroModules
import VisionCamera

/// Stub: compiles against the N-3.2 spec and answers every frame with "no pose".
/// MediaPipe Tasks for iOS comes in N-3.8.
class HybridPoseDetector: HybridPoseDetectorSpec {
  private(set) var rebuilds: Double = 0

  func configure(config: PoseConfig) throws {}

  func detect(frame: any HybridFrameSpec) throws -> PoseResult {
    return PoseResult(
      status: .noPose,
      frameTimeSec: frame.timestamp,
      landmarks: ArrayBuffer.allocate(size: 33 * 4 * 4, initializeToZero: true),
      convertMs: 0,
      inferenceMs: 0,
      totalMs: 0,
      delegate: .cpu,
      rotationDegrees: 0
    )
  }

  func reset() throws {}

  func runtimeInfo() throws -> String {
    return "stub (MediaPipe iOS kommer i N-3.8)"
  }
}
