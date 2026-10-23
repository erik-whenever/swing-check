// Config plugin: wires react-native-mediapipe-pose-plugin into the prebuilt native projects.
//
// The package ships no pod or gradle module — its README says to copy its Swift/ObjC/Kotlin
// files into the app and edit three things by hand. This plugin does exactly those steps and
// nothing else, so the native code that runs is the package's own:
//   iOS:     MediaPipeTasksVision pod, the linker + C++20 post_install from its README,
//            PoseLandmarkerPlugin.{swift,m} into the app target, bridging-header imports.
//   Android: tasks-vision dependency, noCompress "task", the Kotlin file under the app's
//            package, registration in MainApplication (README §5, verbatim).
// Our only edit to their code: the model name. Both platforms hardcode
// "pose_landmarker_full"; MODEL_LINE swaps it for the variant this build measures.
//
// The .task files are downloaded at prebuild from Google's versioned URLs and checked against
// sha256, so a silently swapped model fails the build instead of skewing the numbers.

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const {
  IOSConfig,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withPodfile,
  withXcodeProject,
} = require('expo/config-plugins');

const PKG_DIR = path.dirname(require.resolve('react-native-mediapipe-pose-plugin/package.json'));

const MODELS = {
  // Byte-identical to the web app's public/models/pose_landmarker_lite.task.
  lite: {
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  },
  full: {
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  },
};

const MEDIAPIPE_POD = "pod 'MediaPipeTasksVision', '~> 0.10.14'";
const MEDIAPIPE_ANDROID = "implementation 'com.google.mediapipe:tasks-vision:0.10.29'";

/** The one line that changes the package's code: which model file it loads. */
const MODEL_LINE = (source, model) => source.replace(/pose_landmarker_full/g, `pose_landmarker_${model}`);

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} → HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function writeModel(model, destDir) {
  const { url, sha256 } = MODELS[model];
  const file = path.join(destDir, `pose_landmarker_${model}.task`);
  if (fs.existsSync(file) && hash(fs.readFileSync(file)) === sha256) return file;
  const bytes = await download(url);
  const got = hash(bytes);
  if (got !== sha256) {
    throw new Error(`pose_landmarker_${model}.task: sha256 ${got}, expected ${sha256}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

function hash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

const withIosFiles = (config, { model }) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const appDir = path.join(iosRoot, name);
      const moduleName = name.replace(/[^A-Za-z0-9_]/g, '_');

      const swift = fs.readFileSync(path.join(PKG_DIR, 'ios', 'PoseLandmarkerPlugin.swift'), 'utf8');
      fs.writeFileSync(path.join(appDir, 'PoseLandmarkerPlugin.swift'), MODEL_LINE(swift, model));

      // README §5: the .m hardcodes AI-PEER's generated Swift header.
      const objc = fs.readFileSync(path.join(PKG_DIR, 'ios', 'PoseLandmarkerPlugin.m'), 'utf8');
      fs.writeFileSync(
        path.join(appDir, 'PoseLandmarkerPlugin.m'),
        objc.replace('#import "AIPEER-Swift.h"', `#import "${moduleName}-Swift.h"`),
      );

      const bridging = path.join(appDir, `${name}-Bridging-Header.h`);
      const imports = fs
        .readFileSync(path.join(PKG_DIR, 'ios', 'BridgingHeader.h'), 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('#import'));
      const current = fs.existsSync(bridging) ? fs.readFileSync(bridging, 'utf8') : '';
      const missing = imports.filter((l) => !current.includes(l));
      if (missing.length) fs.writeFileSync(bridging, `${current.trimEnd()}\n${missing.join('\n')}\n`);

      await writeModel(model, appDir);
      return cfg;
    },
  ]);

const withIosProject = (config, { model }) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    for (const file of ['PoseLandmarkerPlugin.swift', 'PoseLandmarkerPlugin.m']) {
      const filepath = `${name}/${file}`;
      if (!project.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project });
      }
    }
    const task = `${name}/pose_landmarker_${model}.task`;
    if (!project.hasFile(task)) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: task, groupName: name, project, isBuildFile: true });
    }
    return cfg;
  });

const withIosPodfile = (config) =>
  withPodfile(config, (cfg) => {
    let podfile = cfg.modResults.contents;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    if (!podfile.includes(MEDIAPIPE_POD)) {
      podfile = podfile.replace(/(target '[^']+' do\n)/, `$1  ${MEDIAPIPE_POD}\n`);
    }
    if (!podfile.includes('MediaPipeTasksVision.xcframework/ios-arm64')) {
      // README §2 and §3, verbatim apart from the target name.
      const block = `
    # --- react-native-mediapipe-pose-plugin README §2: xcframework + linker fix
    xcf_vision = '\${PODS_ROOT}/MediaPipeTasksVision/frameworks/MediaPipeTasksVision.xcframework'
    xcf_common = '\${PODS_ROOT}/MediaPipeTasksCommon/frameworks/MediaPipeTasksCommon.xcframework'
    Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', 'Pods-${name}', '*.xcconfig')).each do |xcconfig_path|
      config = File.read(xcconfig_path)
      config = config.gsub('-l"MediaPipeTasksCommon"', '-framework "MediaPipeTasksCommon"')
      config = config.gsub('-l"MediaPipeTasksVision"', '-framework "MediaPipeTasksVision"')
      unless config.include?('MediaPipeTasksVision.xcframework/ios-arm64')
        config += "\\nFRAMEWORK_SEARCH_PATHS = $(inherited) \\"#{xcf_vision}/ios-arm64\\" \\"#{xcf_common}/ios-arm64\\""
      end
      File.write(xcconfig_path, config)
    end
    # --- README §3: C++20
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
        config.build_settings['CLANG_CXX_LIBRARY'] = 'libc++'
      end
    end
    Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', '**', '*.xcconfig')).each do |xcconfig_path|
      contents = File.read(xcconfig_path)
      patched = contents.gsub(/CLANG_CXX_LANGUAGE_STANDARD = (?:"?(?:gnu\\+\\+14|gnu\\+\\+17|c\\+\\+14|c\\+\\+17)"?)/, 'CLANG_CXX_LANGUAGE_STANDARD = c++20')
      File.write(xcconfig_path, patched) if patched != contents
    end
`;
      const call = /react_native_post_install\([\s\S]*?\n\s*\)\n/;
      if (!call.test(podfile)) throw new Error('withPoseLandmarker: react_native_post_install(...) not found in Podfile');
      podfile = podfile.replace(call, (m) => m + block);
    }
    cfg.modResults.contents = podfile;
    return cfg;
  });

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

const withAndroidFiles = (config, { model }) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const pkg = cfg.android.package;
      const kotlin = fs.readFileSync(
        path.join(PKG_DIR, 'android', 'src', 'main', 'java', 'com', 'poselandmarker', 'PoseLandmarkerFrameProcessorPlugin.kt'),
        'utf8',
      );
      const dir = path.join(root, 'app', 'src', 'main', 'java', ...pkg.split('.'), 'poselandmarker');
      fs.mkdirSync(dir, { recursive: true });
      // README §4: the package line must match the directory.
      fs.writeFileSync(
        path.join(dir, 'PoseLandmarkerFrameProcessorPlugin.kt'),
        MODEL_LINE(kotlin, model).replace(/^package com\.poselandmarker$/m, `package ${pkg}.poselandmarker`),
      );
      await writeModel(model, path.join(root, 'app', 'src', 'main', 'assets'));
      return cfg;
    },
  ]);

const withAndroidGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes(MEDIAPIPE_ANDROID)) {
      gradle = gradle.replace(/dependencies\s*\{\n/, (m) => `${m}    ${MEDIAPIPE_ANDROID}\n`);
    }
    // README §2: AAPT compression breaks the mmap'd .task.
    if (!gradle.includes('noCompress += "task"')) {
      gradle = gradle.replace(/android\s*\{\n/, (m) => `${m}    androidResources {\n        noCompress += "task"\n    }\n`);
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });

const withAndroidRegistration = (config) =>
  withMainApplication(config, (cfg) => {
    const pkg = cfg.android.package;
    let src = cfg.modResults.contents;
    if (src.includes('addFrameProcessorPlugin("poseLandmarker")')) return cfg;
    // README §5, verbatim.
    src = src.replace(
      /^(package .*\n)/m,
      `$1\nimport ${pkg}.poselandmarker.PoseLandmarkerFrameProcessorPlugin\nimport com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry\n`,
    );
    src = src.replace(
      /(class MainApplication\s*:[^{]*\{\n)/,
      `$1  companion object {\n    init {\n      FrameProcessorPluginRegistry.addFrameProcessorPlugin("poseLandmarker") { proxy, options ->\n        PoseLandmarkerFrameProcessorPlugin(proxy, options)\n      }\n    }\n  }\n\n`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = function withPoseLandmarker(config, { model = 'lite' } = {}) {
  if (!MODELS[model]) throw new Error(`withPoseLandmarker: unknown model "${model}"`);
  config = withIosFiles(config, { model });
  config = withIosProject(config, { model });
  config = withIosPodfile(config);
  config = withAndroidFiles(config, { model });
  config = withAndroidGradle(config);
  config = withAndroidRegistration(config);
  return config;
};
