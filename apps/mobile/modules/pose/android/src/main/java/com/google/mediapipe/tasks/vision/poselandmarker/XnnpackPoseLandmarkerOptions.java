package com.google.mediapipe.tasks.vision.poselandmarker;

import com.google.mediapipe.calculator.proto.InferenceCalculatorProto.InferenceCalculatorOptions.Delegate.Xnnpack;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.proto.CalculatorOptionsProto.CalculatorOptions;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.core.ErrorListener;
import com.google.mediapipe.tasks.core.OutputHandler.ResultListener;
import com.google.mediapipe.tasks.core.proto.AccelerationProto.Acceleration;
import com.google.mediapipe.tasks.core.proto.BaseOptionsProto;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.poselandmarker.proto.PoseLandmarkerGraphOptionsProto.PoseLandmarkerGraphOptions;
import java.util.Optional;

/**
 * N-3.2 diagnosis: the CPU landmarker with MediaPipe's XNNPACK delegate and an explicit thread
 * count. The Java API cannot ask for it: Delegate.CPU becomes {@code acceleration { tflite {} }}
 * (TaskOptions.convertBaseOptionsToProto), and inference_calculator_cpu.cc then adds no delegate
 * and leaves cpu_num_thread at -1. This wraps real options and rewrites only the acceleration in
 * the graph options; the C++ PoseLandmarkerGraph copies it to the detector and landmark subgraphs.
 *
 * It lives in MediaPipe's package because the getters it forwards are package-private. Android
 * has no module system, so a class in the same package name and class loader may override them.
 * OSÄKER: depends on PoseLandmarkerOptions' package-private shape in 0.10.35 (checked with javap);
 * a MediaPipe upgrade can break the build here, never the runtime silently. Diagnostics only.
 */
public final class XnnpackPoseLandmarkerOptions extends PoseLandmarker.PoseLandmarkerOptions {
  private final PoseLandmarker.PoseLandmarkerOptions base;
  private final int numThreads;

  public XnnpackPoseLandmarkerOptions(PoseLandmarker.PoseLandmarkerOptions base, int numThreads) {
    this.base = base;
    this.numThreads = numThreads;
  }

  @Override
  BaseOptions baseOptions() {
    return base.baseOptions();
  }

  @Override
  RunningMode runningMode() {
    return base.runningMode();
  }

  @Override
  Optional<Integer> numPoses() {
    return base.numPoses();
  }

  @Override
  Optional<Float> minPoseDetectionConfidence() {
    return base.minPoseDetectionConfidence();
  }

  @Override
  Optional<Float> minPosePresenceConfidence() {
    return base.minPosePresenceConfidence();
  }

  @Override
  Optional<Float> minTrackingConfidence() {
    return base.minTrackingConfidence();
  }

  @Override
  boolean outputSegmentationMasks() {
    return base.outputSegmentationMasks();
  }

  @Override
  Optional<ResultListener<PoseLandmarkerResult, MPImage>> resultListener() {
    return base.resultListener();
  }

  @Override
  Optional<ErrorListener> errorListener() {
    return base.errorListener();
  }

  @Override
  public CalculatorOptions convertToCalculatorOptionsProto() {
    CalculatorOptions options = base.convertToCalculatorOptionsProto();
    PoseLandmarkerGraphOptions graph = options.getExtension(PoseLandmarkerGraphOptions.ext);
    BaseOptionsProto.BaseOptions baseProto =
        BaseOptionsProto.BaseOptions.newBuilder(graph.getBaseOptions())
            .setAcceleration(
                Acceleration.newBuilder().setXnnpack(Xnnpack.newBuilder().setNumThreads(numThreads)))
            .build();
    return CalculatorOptions.newBuilder()
        .setExtension(PoseLandmarkerGraphOptions.ext, PoseLandmarkerGraphOptions.newBuilder(graph).setBaseOptions(baseProto).build())
        .build();
  }
}
