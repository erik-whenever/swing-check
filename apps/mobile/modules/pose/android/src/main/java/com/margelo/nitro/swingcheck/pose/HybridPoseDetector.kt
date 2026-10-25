package com.margelo.nitro.swingcheck.pose

import android.os.Process
import android.util.Log
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.ByteBufferImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import kotlin.math.roundToLong

/**
 * MediaPipe Pose Landmarker in synchronous VIDEO mode on VisionCamera's frame thread
 * (pose-android.md, ADR-0004 tillägget).
 *
 * The landmarker is built lazily on the thread that calls detect(), because a GPU landmarker is
 * bound to the thread that created it. It is rebuilt when the config changes, when reset() was
 * called, when detect() arrives on another thread (VC #4213/#4227: an idle FrameOutput thread
 * ends after 5 s and a new one takes over), and when the camera's time base goes backwards.
 * configure()/reset() come from the JS thread, so they only set flags that detect() reads.
 */
class HybridPoseDetector : HybridPoseDetectorSpec() {
  private class Built(
    val landmarker: PoseLandmarker,
    val config: PoseConfig,
    val generation: Int,
    val delegate: PoseDelegate,
    val thread: Thread,
    val diagGeneration: Int,
  )

  @Volatile private var config: PoseConfig? = null
  @Volatile private var generation = 0
  @Volatile private var resetRequested = false
  @Volatile private var buildCount = 0

  // Camera thread only.
  private var built: Built? = null
  private var gpuFailedFor = -1
  private var lastTimestampMs = Long.MIN_VALUE
  private val converter = FrameConverter()

  override val rebuilds: Double
    get() = maxOf(0, buildCount - 1).toDouble()

  override fun configure(config: PoseConfig) {
    this.config = config
    generation++
  }

  override fun reset() {
    resetRequested = true
  }

  override fun detect(frame: HybridFrameSpec): PoseResult {
    val t0 = System.nanoTime()
    val config = config ?: throw Error("PoseDetector.configure() must be called before detect()")
    val generation = generation
    val image = (frame as NativeFrame).image
    // N-3.2 diagnosis: 'camera' runs here as before; otherwise the whole detect, including the
    // landmarker build, runs on a dedicated thread at that priority while this one waits.
    val mode = PoseDiag.inferenceThread
    PoseDiag.callerCpu = PoseDiag.cpuOf(Process.myTid())
    return try {
      PoseDiag.runOn(mode) { detectHere(image, config, generation, t0) }
    } catch (e: Throwable) {
      Log.e(TAG, "detect on the $mode thread failed", e)
      val info = image.imageInfo
      PoseResult(
        status = PoseStatus.ERROR,
        frameTimeSec = info.timestamp / 1e9,
        landmarks = PoseModels.empty(),
        convertMs = 0.0,
        inferenceMs = 0.0,
        totalMs = (System.nanoTime() - t0) / 1e6,
        delegate = config.delegate,
        rotationDegrees = info.rotationDegrees.toDouble(),
      )
    }
  }

  private fun detectHere(image: ImageProxy, config: PoseConfig, generation: Int, t0: Long): PoseResult {
    val info = image.imageInfo
    val ns = info.timestamp
    // imageInfo, not frame.orientation: VC #4096 has LEFT/RIGHT swapped on Android.
    val rotation = info.rotationDegrees
    val frameTimeSec = ns / 1e9
    var delegate = config.delegate
    var convertMs = 0.0
    var inferenceMs = 0.0
    // VisionCamera's isMirrored is metadata only: ImageAnalysis never mirrors the buffer, so the
    // buffer is already the unmirrored image and nothing is flipped back (pose-android.md §2).
    return try {
      var ms = (ns / 1e6).roundToLong()
      val backwards = lastTimestampMs != Long.MIN_VALUE && ms < lastTimestampMs - 1000
      val b = ensureBuilt(config, generation, backwards)
      delegate = b.delegate
      if (backwards) lastTimestampMs = Long.MIN_VALUE
      // MediaPipe's VIDEO mode demands strictly increasing timestamps (as the spike and the web).
      if (lastTimestampMs != Long.MIN_VALUE && ms <= lastTimestampMs) ms = lastTimestampMs + 1
      lastTimestampMs = ms

      val tc = System.nanoTime()
      val input = converter.convert(image, rotation)
      val ti = System.nanoTime()
      convertMs = (ti - tc) / 1e6
      val mpImage = ByteBufferImageBuilder(input.buffer, input.width, input.height, MPImage.IMAGE_FORMAT_RGBA).build()
      val td = System.nanoTime()
      val result = try {
        b.landmarker.detectForVideo(mpImage, ms)
      } catch (e: Throwable) {
        if (b.delegate == PoseDelegate.GPU) gpuFailedFor = b.generation
        throw e
      } finally {
        mpImage.close()
      }
      val tp = System.nanoTime()
      // inferenceMs keeps its N-3.2 meaning (MPImage + detectForVideo) so runs stay comparable;
      // the split is in PoseDiag.
      inferenceMs = (tp - ti) / 1e6
      val landmarks = PoseModels.pack(result)
      PoseDiag.wrapMs = (td - ti) / 1e6
      PoseDiag.detectMs = (tp - td) / 1e6
      PoseDiag.packMs = (System.nanoTime() - tp) / 1e6
      PoseDiag.inferenceCpu = PoseDiag.cpuOf(Process.myTid())
      PoseDiag.inferenceNice = Process.getThreadPriority(Process.myTid())
      PoseResult(
        status = if (landmarks != null) PoseStatus.OK else PoseStatus.NO_POSE,
        frameTimeSec = frameTimeSec,
        landmarks = landmarks ?: PoseModels.empty(),
        convertMs = convertMs,
        inferenceMs = inferenceMs,
        totalMs = (System.nanoTime() - t0) / 1e6,
        delegate = delegate,
        rotationDegrees = rotation.toDouble(),
      )
    } catch (e: Throwable) {
      // Never throw per frame: an exception in the frame callback kills the process (VC #4219).
      Log.e(TAG, "detect failed", e)
      PoseResult(
        status = PoseStatus.ERROR,
        frameTimeSec = frameTimeSec,
        landmarks = PoseModels.empty(),
        convertMs = convertMs,
        inferenceMs = inferenceMs,
        totalMs = (System.nanoTime() - t0) / 1e6,
        delegate = delegate,
        rotationDegrees = rotation.toDouble(),
      )
    }
  }

  private fun ensureBuilt(config: PoseConfig, generation: Int, backwards: Boolean): Built {
    val current = built
    val thread = Thread.currentThread()
    val gpuFailed = current != null && current.delegate == PoseDelegate.GPU && gpuFailedFor == current.generation
    val diagGeneration = PoseDiag.generation
    if (current != null && !resetRequested && !backwards && !gpuFailed &&
      current.generation == generation && current.thread === thread && current.diagGeneration == diagGeneration
    ) {
      return current
    }
    resetRequested = false
    if (current != null) {
      Log.i(
        TAG,
        "rebuild: config=${current.generation != generation} thread=${current.thread !== thread} " +
          "backwards=$backwards gpuFailed=$gpuFailed diag=${current.diagGeneration != diagGeneration}",
      )
      // OSÄKER: en GPU-landmarker stängs här på den nya tråden när den gamla har tagits ur bruk
      // (#4213). Det är inte prövat att MediaPipe tål det; ett fel loggas och ignoreras, och då
      // läcker den gamla grafen i stället för att appen kraschar.
      try {
        current.landmarker.close()
      } catch (e: Throwable) {
        Log.w(TAG, "close of the previous landmarker failed", e)
      }
      built = null
    }
    val t0 = System.nanoTime()
    val cpuThreads = PoseDiag.cpuThreads
    val wantGpu = config.delegate == PoseDelegate.GPU && gpuFailedFor != generation
    val (landmarker, delegate) = if (wantGpu) {
      try {
        PoseModels.build(config.model, PoseDelegate.GPU, RunningMode.VIDEO) to PoseDelegate.GPU
      } catch (e: Throwable) {
        // Some Mali and older Adreno GPUs fail here; the delegate in each result tells the
        // measurement what ran.
        Log.w(TAG, "GPU landmarker failed, falling back to CPU", e)
        gpuFailedFor = generation
        PoseModels.build(config.model, PoseDelegate.CPU, RunningMode.VIDEO, cpuThreads) to PoseDelegate.CPU
      }
    } else {
      PoseModels.build(config.model, PoseDelegate.CPU, RunningMode.VIDEO, cpuThreads) to PoseDelegate.CPU
    }
    buildCount++
    lastTimestampMs = Long.MIN_VALUE
    Log.i(
      TAG,
      "built ${config.model} on $delegate (cpuThreads $cpuThreads) in ${(System.nanoTime() - t0) / 1_000_000} ms " +
        "(${thread.name}, nice ${Process.getThreadPriority(Process.myTid())})",
    )
    return Built(landmarker, config, generation, delegate, thread, diagGeneration).also { built = it }
  }

  override fun runtimeInfo(): String {
    // PoseLandmarker's static initializer loads libmediapipe_tasks_jni.so; loadLibrary is a
    // no-op after that, and throws if the .so is missing.
    Class.forName("com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker")
    System.loadLibrary("mediapipe_tasks_jni")
    return "MediaPipe tasks-vision ${BuildConfig.MEDIAPIPE_VERSION} (libmediapipe_tasks_jni), " +
      "libyuv ${YuvNative.version()}, modell ${PoseModels.loadMode(PoseModel.LITE)}"
  }

  companion object {
    private const val TAG = "SwingPose"
  }
}
