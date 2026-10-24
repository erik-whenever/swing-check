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
  inferenceMs: number
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
   * conversion's effect on the landmarks shows up next to the plain run.
   */
  detectImage(path: string, config: PoseConfig, viaYuv: boolean): PoseImageResult
}
