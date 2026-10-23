// Which native packages each spike build links. MediaPipe and fast-tflite cannot share an
// iOS binary: both carry TFLite's C API (54 duplicate TfLite* symbols, EAS build
// 60a0c910…). So the pose build leaves out fast-tflite and the resize plugin, and the shaft
// build leaves out MediaPipe (app.config.ts skips withPoseLandmarker for it).
const SPIKE = process.env.SPIKE === 'shaft' ? 'shaft' : 'pose';
const off = { platforms: { ios: null, android: null } };

module.exports = {
  dependencies:
    SPIKE === 'pose' ? { 'react-native-fast-tflite': off, 'vision-camera-resize-plugin': off } : {},
};
