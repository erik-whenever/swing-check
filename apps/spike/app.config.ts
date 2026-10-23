import type { ExpoConfig } from 'expo/config';

// N-2 spike: a measuring view, nothing else. Throwaway — N-3 starts clean on SDK 58 +
// VisionCamera 5. Pinned to SDK 54 / VisionCamera 4 because the only MediaPipe Pose plugin
// for VisionCamera on iOS that holds (react-native-mediapipe-pose-plugin) is validated there.
//
// Two kinds of build (eas.json), because MediaPipe and fast-tflite cannot be linked into the
// same iOS binary (duplicate TfLite* symbols): `pose` (MediaPipe, lite or full) and `shaft`
// (fast-tflite + Core ML). react-native.config.js drops the other side's native packages.

const SPIKE = process.env.SPIKE === 'shaft' ? 'shaft' : 'pose';
/** Which MediaPipe Pose model the native plugin loads. One pose build per variant. */
const POSE_MODEL = process.env.POSE_MODEL === 'full' ? 'full' : 'lite';
/** Also the bundle id suffix: the first build (pose lite) shipped as `.lite`, kept so its credentials stay valid. */
const VARIANT = SPIKE === 'shaft' ? 'shaft' : POSE_MODEL;

const config: ExpoConfig = {
  name: SPIKE === 'shaft' ? 'Spike skaft' : `Spike pose ${POSE_MODEL}`,
  slug: 'swingcheck-spike',
  version: '0.0.0',
  orientation: 'landscape',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: `com.swingcheck.spike.${VARIANT}`,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'Spiken mäter pose och skaft på kamerabilden.',
    },
  },
  android: {
    package: `com.swingcheck.spike.${VARIANT}`,
    permissions: ['android.permission.CAMERA'],
  },
  owner: 'erikhawerman',
  extra: {
    spike: SPIKE,
    poseModel: SPIKE === 'pose' ? POSE_MODEL : null,
    eas: { projectId: 'cc4eccde-189a-49ae-aca9-a0689268640c' },
  },
  plugins: [
    ['react-native-vision-camera', { enableFrameProcessors: true, enableMicrophonePermission: false }],
    ...(SPIKE === 'shaft'
      ? [['react-native-fast-tflite', { enableCoreMLDelegate: true, enableAndroidGpuLibraries: true }] as [string, object]]
      : [['./plugins/withPoseLandmarker', { model: POSE_MODEL }] as [string, object]]),
    ['expo-build-properties', { ios: { deploymentTarget: '15.1' }, android: { minSdkVersion: 29 } }],
  ],
};

export default config;
