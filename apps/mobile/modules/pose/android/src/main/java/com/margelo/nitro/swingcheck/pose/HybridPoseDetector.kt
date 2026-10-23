package com.margelo.nitro.swingcheck.pose

import com.margelo.nitro.camera.HybridFrameSpec

/**
 * N-3.1 stub: answers every frame with "no pose". MediaPipe is linked in (build.gradle)
 * but not run yet — N-3.2 loads the Pose Landmarker in VIDEO mode here.
 */
class HybridPoseDetector : HybridPoseDetectorSpec() {
  override fun load(model: PoseModel) = Unit

  override fun detect(frame: HybridFrameSpec): PoseFrameResult =
    PoseFrameResult(timestamp = frame.timestamp, landmarks = emptyArray(), inferenceMs = 0.0)

  override fun runtimeInfo(): String {
    // PoseLandmarker's static initializer loads libmediapipe_tasks_jni.so, the library
    // N-3.2 runs. loadLibrary is a no-op after that, and throws if the .so is missing.
    Class.forName("com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker")
    System.loadLibrary("mediapipe_tasks_jni")
    return "MediaPipe tasks-vision ${BuildConfig.MEDIAPIPE_VERSION} (libmediapipe_tasks_jni)"
  }
}
