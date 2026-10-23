package com.margelo.nitro.swingcheck.shaft

import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.core.ArrayBuffer
import org.tensorflow.lite.TensorFlowLite
import org.tensorflow.lite.gpu.CompatibilityList

/**
 * N-3.1 stub: answers every frame with an empty output. LiteRT and its GPU delegate are
 * linked in (build.gradle) but no model is run yet — N-3.3 does the letterbox, rotation,
 * colour order and the GPU run here.
 */
class HybridShaftDetector : HybridShaftDetectorSpec() {
  override fun load(modelPath: String) = Unit

  override fun detect(frame: HybridFrameSpec): ShaftFrameResult =
    ShaftFrameResult(
      output = ArrayBuffer.allocate(0),
      numAnchors = 0.0,
      letterbox = ShaftLetterbox(size = 0.0, scale = 0.0, padX = 0.0, padY = 0.0, drawWidth = 0.0, drawHeight = 0.0),
      sourceWidth = frame.width,
      sourceHeight = frame.height,
      preprocessMs = 0.0,
      inferenceMs = 0.0,
    )

  override fun runtimeInfo(): String {
    // init() loads libtensorflowlite_jni.so; the GPU delegate lives in its own
    // libtensorflowlite_gpu_jni.so, which loadLibrary loads (and throws if missing).
    TensorFlowLite.init()
    System.loadLibrary("tensorflowlite_gpu_jni")
    val gpu = CompatibilityList()
    val gpuSupported = try { gpu.isDelegateSupportedOnThisDevice } finally { gpu.close() }
    return "LiteRT ${TensorFlowLite.runtimeVersion()} (libtensorflowlite_jni + gpu_jni), " +
      "GPU-delegat ${if (gpuSupported) "stöds" else "stöds inte"} på enheten"
  }
}
