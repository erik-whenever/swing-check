import type { ExpoConfig } from 'expo/config';

// N-2 spike: a measuring view, nothing else. Throwaway — N-3 starts clean on SDK 58 +
// VisionCamera 5. Pinned to SDK 54 / VisionCamera 4 because the only MediaPipe Pose plugin
// for VisionCamera on iOS that holds (react-native-mediapipe-pose-plugin) is validated there.

/** Which MediaPipe Pose model the native plugin loads. One build per variant (eas.json). */
const POSE_MODEL = process.env.POSE_MODEL === 'full' ? 'full' : 'lite';

const config: ExpoConfig = {
  name: POSE_MODEL === 'full' ? 'Spike full' : 'Spike lite',
  slug: 'swingcheck-spike',
  version: '0.0.0',
  orientation: 'landscape',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: `com.swingcheck.spike.${POSE_MODEL}`,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'Spiken mäter pose och skaft på kamerabilden.',
    },
  },
  android: {
    package: `com.swingcheck.spike.${POSE_MODEL}`,
    permissions: ['android.permission.CAMERA'],
  },
  owner: 'erikhawerman',
  extra: { poseModel: POSE_MODEL, eas: { projectId: 'cc4eccde-189a-49ae-aca9-a0689268640c' } },
  plugins: [
    ['react-native-vision-camera', { enableFrameProcessors: true, enableMicrophonePermission: false }],
    ['react-native-fast-tflite', { enableCoreMLDelegate: true, enableAndroidGpuLibraries: true }],
    ['./plugins/withPoseLandmarker', { model: POSE_MODEL }],
    ['expo-build-properties', { ios: { deploymentTarget: '15.1' }, android: { minSdkVersion: 29 } }],
  ],
};

export default config;
