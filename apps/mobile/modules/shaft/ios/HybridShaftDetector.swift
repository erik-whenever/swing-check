import NitroModules
import VisionCamera

/// N-3.1 stub: compiles against the generated spec and answers every frame with an empty
/// output. Core ML directly (no TFLite, ADR-0004) comes in N-3.8.
class HybridShaftDetector: HybridShaftDetectorSpec {
  func load(modelPath: String) throws {}

  func detect(frame: any HybridFrameSpec) throws -> ShaftFrameResult {
    return ShaftFrameResult(
      output: ArrayBuffer.allocate(size: 0),
      numAnchors: 0,
      letterbox: ShaftLetterbox(size: 0, scale: 0, padX: 0, padY: 0, drawWidth: 0, drawHeight: 0),
      sourceWidth: frame.width,
      sourceHeight: frame.height,
      preprocessMs: 0,
      inferenceMs: 0
    )
  }

  func runtimeInfo() throws -> String {
    return "stub (Core ML kommer i N-3.8)"
  }
}
