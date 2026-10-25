package com.margelo.nitro.swingcheck.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import com.google.mediapipe.framework.image.ByteBufferImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.vision.core.RunningMode

/**
 * Measurement and parity helpers for the dev screen (pose-android.md §7). Android only; not
 * part of the PoseDetector contract.
 */
class HybridPoseProbe : HybridPoseProbeSpec() {
  private val glRenderer: String by lazy { readGlRenderer() }

  override fun deviceInfo(): PoseDeviceInfo {
    val soc = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    return PoseDeviceInfo(
      manufacturer = Build.MANUFACTURER,
      model = Build.MODEL,
      socManufacturer = if (soc) Build.SOC_MANUFACTURER else "",
      socModel = if (soc) Build.SOC_MODEL else "",
      androidRelease = Build.VERSION.RELEASE,
      sdkInt = Build.VERSION.SDK_INT.toDouble(),
      glRenderer = glRenderer,
      timestampSources = timestampSources(),
      mediapipeVersion = BuildConfig.MEDIAPIPE_VERSION,
      libyuvVersion = YuvNative.version().toDouble(),
      modelSha256Lite = BuildConfig.POSE_LITE_SHA256,
      modelSha256Full = BuildConfig.POSE_FULL_SHA256,
      modelLoad = PoseModels.loadMode(PoseModel.LITE),
      cpuClusters = PoseDiag.cpuClusters(),
    )
  }

  override fun setDiagnostics(inferenceThread: String, cpuThreads: Double) {
    PoseDiag.set(inferenceThread, cpuThreads.toInt())
  }

  override fun lastFrame(): PoseFrameDiag =
    PoseFrameDiag(
      wrapMs = PoseDiag.wrapMs,
      detectMs = PoseDiag.detectMs,
      packMs = PoseDiag.packMs,
      callerCpu = PoseDiag.callerCpu.toDouble(),
      inferenceCpu = PoseDiag.inferenceCpu.toDouble(),
      inferenceNice = PoseDiag.inferenceNice.toDouble(),
    )

  override fun resetThreadSamples() = PoseDiag.resetThreadSamples()

  override fun sampleThreads() = PoseDiag.sampleThreads()

  override fun threadReport(): String = PoseDiag.threadReport()

  override fun logcat(maxLines: Double): String = PoseDiag.logcat(maxLines.toInt())

  override fun thermal(): PoseThermal {
    val pm = PoseModels.context().getSystemService(Context.POWER_SERVICE) as PowerManager
    val status = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      when (pm.currentThermalStatus) {
        PowerManager.THERMAL_STATUS_NONE -> "none"
        PowerManager.THERMAL_STATUS_LIGHT -> "light"
        PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
        PowerManager.THERMAL_STATUS_SEVERE -> "severe"
        PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
        PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
        else -> "unknown"
      }
    } else {
      "unknown"
    }
    // Headroom warns before the status changes. NaN means "not known yet" (called too often or
    // unsupported), reported as -1.
    val headroom = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) pm.getThermalHeadroom(10) else Float.NaN
    return PoseThermal(status = status, headroom = if (headroom.isNaN()) -1.0 else headroom.toDouble())
  }

  override fun clock(): PoseClock =
    PoseClock(
      elapsedRealtimeSec = SystemClock.elapsedRealtimeNanos() / 1e9,
      uptimeSec = SystemClock.uptimeMillis() / 1e3,
    )

  override fun detectImage(path: String, config: PoseConfig, viaYuv: Boolean, runs: Double): PoseImageResult =
    // The same thread and CPU threads as the live detector, so a still and the camera compare.
    PoseDiag.runOn(PoseDiag.inferenceThread) { detectImageHere(path, config, viaYuv, maxOf(1, runs.toInt())) }

  private fun detectImageHere(path: String, config: PoseConfig, viaYuv: Boolean, runs: Int): PoseImageResult {
    val file = path.removePrefix("file://")
    val bitmap = BitmapFactory.decodeFile(
      file,
      BitmapFactory.Options().apply {
        inPreferredConfig = Bitmap.Config.ARGB_8888
        inScaled = false
        inPremultiplied = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
        }
      },
    ) ?: throw Error("PoseProbe.detectImage: could not decode $file")
    val w = bitmap.width
    val h = bitmap.height
    // ARGB_8888 is stored as R, G, B, A bytes: exactly MediaPipe's IMAGE_FORMAT_RGBA.
    var rgba = FrameConverter.direct(w * h * 4)
    bitmap.copyPixelsToBuffer(rgba)
    bitmap.recycle()
    rgba.rewind()

    if (viaYuv) {
      // The camera path's conversion on known pixels: RGBA → full-range I420 → the same
      // libyuv calls as a frame (rotation 0, same size, so the scale step is a copy).
      val ySize = w * h
      val cSize = ((w + 1) / 2) * ((h + 1) / 2)
      val i420 = FrameConverter.direct(ySize + 2 * cSize)
      check(YuvNative.rgbaToJ420(rgba, w, h, i420) == 0) { "ABGRToJ420 failed" }
      val u = i420.duplicate().apply { position(ySize) }
      val v = i420.duplicate().apply { position(ySize + cSize) }
      rgba = FrameConverter().yuv(i420, 0, w, u, ySize, v, ySize + cSize, (w + 1) / 2, 1, w, h, 0, maxOf(w, h)).buffer
    }

    var delegate = config.delegate
    val cpuThreads = PoseDiag.cpuThreads
    val landmarker = try {
      PoseModels.build(config.model, config.delegate, RunningMode.IMAGE, cpuThreads)
    } catch (e: Throwable) {
      if (config.delegate != PoseDelegate.GPU) throw e
      delegate = PoseDelegate.CPU
      PoseModels.build(config.model, PoseDelegate.CPU, RunningMode.IMAGE, cpuThreads)
    }
    try {
      val image = ByteBufferImageBuilder(rgba, w, h, MPImage.IMAGE_FORMAT_RGBA).build()
      // The first run on a fresh landmarker carries the warm-up (XNNPACK packing, GPU shader
      // compilation); the N-3.2 parity times were that run alone.
      val times = DoubleArray(runs)
      var t0 = System.nanoTime()
      val result = landmarker.detect(image)
      times[0] = (System.nanoTime() - t0) / 1e6
      for (i in 1 until runs) {
        t0 = System.nanoTime()
        landmarker.detect(image)
        times[i] = (System.nanoTime() - t0) / 1e6
      }
      val warm = times.drop(1).sorted()
      val inferenceMs = if (warm.isEmpty()) times[0] else warm[warm.size / 2]
      image.close()
      val landmarks = PoseModels.pack(result)
      return PoseImageResult(
        status = if (landmarks != null) PoseStatus.OK else PoseStatus.NO_POSE,
        landmarks = landmarks ?: PoseModels.empty(),
        width = w.toDouble(),
        height = h.toDouble(),
        firstMs = times[0],
        inferenceMs = inferenceMs,
        inferenceCpu = PoseDiag.cpuOf(android.os.Process.myTid()).toDouble(),
        delegate = delegate,
      )
    } finally {
      landmarker.close()
    }
  }

  private fun timestampSources(): String =
    try {
      val cm = PoseModels.context().getSystemService(Context.CAMERA_SERVICE) as CameraManager
      cm.cameraIdList
        .filter { cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK }
        .joinToString(",") { id ->
          val src = cm.getCameraCharacteristics(id).get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE)
          "$id:" + when (src) {
            CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME -> "REALTIME"
            CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE_UNKNOWN -> "UNKNOWN"
            else -> "$src"
          }
        }
    } catch (e: Throwable) {
      "error: ${e.message}"
    }

  /** GL_RENDERER from a throwaway 1×1 pbuffer context. */
  private fun readGlRenderer(): String {
    val display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    if (display == EGL14.EGL_NO_DISPLAY) return "?"
    val version = IntArray(2)
    if (!EGL14.eglInitialize(display, version, 0, version, 1)) return "?"
    try {
      val configs = arrayOfNulls<EGLConfig>(1)
      val count = IntArray(1)
      val attribs = intArrayOf(
        EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
        EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
        EGL14.EGL_NONE,
      )
      if (!EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, count, 0) || count[0] == 0) return "?"
      val ctx = EGL14.eglCreateContext(
        display, configs[0], EGL14.EGL_NO_CONTEXT,
        intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0,
      )
      val surface = EGL14.eglCreatePbufferSurface(
        display, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0,
      )
      try {
        EGL14.eglMakeCurrent(display, surface, surface, ctx)
        return GLES20.glGetString(GLES20.GL_RENDERER) ?: "?"
      } finally {
        EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        EGL14.eglDestroySurface(display, surface)
        EGL14.eglDestroyContext(display, ctx)
      }
    } catch (e: Throwable) {
      return "error: ${e.message}"
    }
  }
}
