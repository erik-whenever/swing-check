// Metro for the app: resolves @swingcheck/core through its file: symlink. The local Nitro
// modules (modules/pose, modules/shaft) are file: links inside this project, so they need
// nothing here.
//
// assets/parity/ holds the pose parity still and its Python reference (training/pose_parity.py).
// It is gitignored (identifiable person) and served by Metro from this machine, as in the spike.
// When it has not been generated, the requires resolve to an empty module instead of breaking
// the bundle, and the dev screen's parity says so.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../packages/core')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

const PARITY_DIR = path.resolve(__dirname, 'assets/parity');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes('assets/parity/')) {
    const file = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (file.startsWith(PARITY_DIR) && !fs.existsSync(file)) return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
