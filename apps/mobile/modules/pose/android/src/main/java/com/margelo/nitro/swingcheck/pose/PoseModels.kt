package com.margelo.nitro.swingcheck.pose

import android.content.Context
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.ArrayBuffer
import java.nio.ByteBuffer

/** The .task assets (downloaded by build.gradle from ../models.json) and landmarker builds. */
internal object PoseModels {
  const val LANDMARKS = 33
  const val FLOATS = LANDMARKS * 4
  const val BYTES = FLOATS * 4

  private val buffers = HashMap<PoseModel, ByteBuffer>()

  fun assetName(model: PoseModel): String = when (model) {
    PoseModel.LITE -> "pose_landmarker_lite.task"
    PoseModel.FULL -> "pose_landmarker_full.task"
  }

  fun context(): Context =
    NitroModules.applicationContext ?: throw Error("PoseDetector: no application context (Nitro not initialized)")

  /** 'mmap' when the asset is stored uncompressed (openFd works), otherwise 'buffer'. */
  fun loadMode(model: PoseModel): String =
    try {
      context().assets.openFd(assetName(model)).close()
      "mmap"
    } catch (_: Exception) {
      "buffer"
    }

  /**
   * MediaPipe's defaults: confidence 0.5/0.5/0.5, as the web (poseDetector.ts sets none). The
   * spike's plugin used 0.3, which gives other misses than the web. One pose.
   */
  fun build(model: PoseModel, delegate: PoseDelegate, mode: RunningMode): PoseLandmarker {
    val ctx = context()
    val base = BaseOptions.builder()
      .setDelegate(if (delegate == PoseDelegate.GPU) Delegate.GPU else Delegate.CPU)
    if (loadMode(model) == "mmap") {
      base.setModelAssetPath(assetName(model))
    } else {
      base.setModelAssetBuffer(buffer(ctx, model))
    }
    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(base.build())
      .setRunningMode(mode)
      .setNumPoses(1)
      .build()
    return PoseLandmarker.createFromOptions(ctx, options)
  }

  /** The compressed-asset fallback: the whole model in a direct buffer, kept for reuse. */
  @Synchronized
  private fun buffer(ctx: Context, model: PoseModel): ByteBuffer =
    buffers.getOrPut(model) {
      val bytes = ctx.assets.open(assetName(model)).use { it.readBytes() }
      FrameConverter.direct(bytes.size).put(bytes).also { it.rewind() }
    }

  /**
   * Float32 × 132 [x, y, z, visibility] in MediaPipe's index order, or null when no pose was
   * found. A missing visibility (Optional) is written as 0, because core's NormalizedLandmark
   * requires a number. Coordinates are not clipped to [0, 1], like the web.
   */
  fun pack(result: PoseLandmarkerResult): ArrayBuffer? {
    val pose = result.landmarks().firstOrNull() ?: return null
    if (pose.size < LANDMARKS) return null
    val out = ArrayBuffer.allocate(BYTES)
    val f = out.getBuffer(false).order(java.nio.ByteOrder.nativeOrder()).asFloatBuffer()
    for (i in 0 until LANDMARKS) {
      val lm = pose[i]
      f.put(lm.x())
      f.put(lm.y())
      f.put(lm.z())
      f.put(lm.visibility().orElse(0f))
    }
    return out
  }

  fun empty(): ArrayBuffer = ArrayBuffer.allocate(BYTES)
}
