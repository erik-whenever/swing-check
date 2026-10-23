// Metro for the spike: resolves @swingcheck/core through its file: symlink and serves the
// TFLite model and the parity frame from this machine during development. Both are
// gitignored (training/export_tflite.py writes them), so they never reach git or EAS.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../packages/core')];
config.resolver.assetExts.push('tflite', 'rgb');
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
