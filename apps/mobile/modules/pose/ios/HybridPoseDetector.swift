import NitroModules
import VisionCamera

/// N-3.1 stub: compiles against the generated spec and answers every frame with "no pose".
/// MediaPipe Tasks for iOS comes in N-3.8.
class HybridPoseDetector: HybridPoseDetectorSpec {
  func load(model: PoseModel) throws {}

  func detect(frame: any HybridFrameSpec) throws -> PoseFrameResult {
    return PoseFrameResult(timestamp: frame.timestamp, landmarks: [], inferenceMs: 0)
  }

  func runtimeInfo() throws -> String {
    return "stub (MediaPipe iOS kommer i N-3.8)"
  }
}
