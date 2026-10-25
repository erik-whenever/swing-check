import type { HybridObject } from 'react-native-nitro-modules'
import type { PoseConfig, PoseDelegate, PoseStatus } from './PoseDetector.nitro'

// Measurement and parity helpers for the N-3.2 dev screen. Android only, and deliberately not
// part of the PoseDetector contract that Swift implements in N-3.8: these read Android APIs
// (PowerManager, Build, Camera2) and run a still image in IMAGE mode.

export interface PoseDeviceInfo {
  manufacturer: string
  model: string
  /** Build.SOC_MANUFACTURER / SOC_MODEL (API 31+), '' below that. */
  socManufacturer: string
  socModel: string
  androidRelease: string
  sdkInt: number
  /** GL_RENDERER from a throwaway EGL context, e.g. "Mali-G57 MC2". */
  glRenderer: string
  /** SENSOR_INFO_TIMESTAMP_SOURCE per back camera, e.g. "0:REALTIME". */
  timestampSources: string
  mediapipeVersion: string
  libyuvVersion: number
  modelSha256Lite: string
  modelSha256Full: string
  /** 'mmap' when the .task is stored uncompressed in the APK, otherwise 'buffer'. */
  modelLoad: string
  /** Cores grouped by cpuinfo_max_freq in MHz, e.g. "0-5:2000,6-7:2200" (the big cores last). */
  cpuClusters: string
}

/** The latest detect()'s split and where it ran (N-3.2 diagnosis). Read right after detect(), same thread. */
export interface PoseFrameDiag {
  /** ByteBufferImageBuilder → MPImage, ms. */
  wrapMs: number
  /** detectForVideo alone, ms. */
  detectMs: number
  /** Result → Float32 ArrayBuffer, ms. */
  packMs: number
  /** The core the calling (camera) thread was on when detect() started, -1 if unknown. */
  callerCpu: number
  /** The core the thread that ran detectForVideo was on right after it, -1 if unknown. */
  inferenceCpu: number
  /** That thread's nice value (-8 = URGENT_DISPLAY, -10 = VIDEO, 0 = default). */
  inferenceNice: number
}

export interface PoseThermal {
  /** PowerManager.currentThermalStatus: none, light, moderate, severe, critical, emergency, shutdown. */
  status: string
  /** PowerManager.getThermalHeadroom(10) (API 30+). -1 when unsupported or not yet known. */
  headroom: number
}

export interface PoseClock {
  /** SystemClock.elapsedRealtimeNanos() / 1e9 (REALTIME, counts deep sleep). */
  elapsedRealtimeSec: number
  /** SystemClock.uptimeMillis() / 1e3 (stops in deep sleep). */
  uptimeSec: number
}

export interface PoseImageResult {
  status: PoseStatus
  /** Same layout as PoseResult.landmarks: Float32 × 132, [x, y, z, visibility]. */
  landmarks: ArrayBuffer
  width: number
  height: number
  /** The first detect on the fresh landmarker (includes warm-up), ms. */
  firstMs: number
  /** Median of the runs after the first, ms (= firstMs when runs is 1). */
  inferenceMs: number
  /** The core the inference thread was on after the last run. */
  inferenceCpu: number
  delegate: PoseDelegate
}

export interface PoseProbe extends HybridObject<{ android: 'kotlin' }> {
  deviceInfo(): PoseDeviceInfo
  thermal(): PoseThermal
  clock(): PoseClock
  /**
   * Runs the image file (PNG/JPEG, already upright) through a fresh landmarker in IMAGE mode,
   * on the calling thread. viaYuv = true first converts the RGBA to full-range I420 and back
   * through the same libyuv code the camera path uses (rotation 0, same size), so the
   * conversion's effect on the landmarks shows up next to the plain run. Runs `runs` times on
   * one landmarker (landmarks from the first) on the thread and CPU threads setDiagnostics chose.
   */
  detectImage(path: string, config: PoseConfig, viaYuv: boolean, runs: number): PoseImageResult
  /**
   * N-3.2 diagnosis. inferenceThread: 'camera' (VisionCamera's frame thread, the default),
   * 'default', 'urgent-display' or 'video' (a dedicated thread at that Process priority).
   * cpuThreads: 0 = MediaPipe's Java default (TFLite CPU), n > 0 = XNNPACK with n threads (CPU
   * delegate only). The detector rebuilds on its next frame.
   */
  setDiagnostics(inferenceThread: string, cpuThreads: number): void
  lastFrame(): PoseFrameDiag
  /** Clears the per-thread CPU samples. */
  resetThreadSamples(): void
  /** One sample of every thread in the process (CPU time, nice, current core). Call at 1 Hz. */
  sampleThreads(): void
  /** JSON {spanS, threads: [{tid, name, cpuPct, nice, cores: {core: samples}}]}, busiest first. */
  threadReport(): string
  /** This process's logcat lines about TFLite, delegates and MediaPipe, the last maxLines. */
  logcat(maxLines: number): string
}
