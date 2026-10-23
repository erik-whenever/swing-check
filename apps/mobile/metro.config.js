// Metro for the app: resolves @swingcheck/core through its file: symlink. The local Nitro
// modules (modules/pose, modules/shaft) are file: links inside this project, so they need
// nothing here.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../packages/core')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
