// N-3.1 dev screen: 30 fps preview, both native stubs called on every frame, and a core
// result. Counters live in synchronizables that the frame thread writes and React reads
// once a second, so nothing crosses to the RN thread per frame.
import { createPoseDetector } from '@swingcheck/native-pose';
import { createShaftDetector } from '@swingcheck/native-shaft';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { createSynchronizable } from 'react-native-worklets';
import { runCoreCheck } from './coreCheck';

const TARGET_FPS = 30;

// One instance each for the app's lifetime. Created on the RN thread, used on the
// frame-processor thread (VisionCamera 5 docs, "Native Frame Processor Plugins").
const pose = createPoseDetector();
const shaft = createShaftDetector();

function nativeInfo(label: string, read: () => string): string {
  try {
    return read();
  } catch (e) {
    return `${label}: FEL ${e instanceof Error ? e.message : String(e)}`;
  }
}

export default function DevScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [selectedFps, setSelectedFps] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ fps: 0, frames: 0, landmarks: -1, shaftWidth: 0 });

  const core = useMemo(() => runCoreCheck(), []);
  const runtimes = useMemo(
    () => ({
      pose: nativeInfo('pose', () => pose.runtimeInfo()),
      shaft: nativeInfo('shaft', () => shaft.runtimeInfo()),
    }),
    [],
  );

  // Written on the frame thread, read here.
  const counters = useMemo(
    () => ({
      frames: createSynchronizable(0, { fixedType: true }),
      landmarks: createSynchronizable(-1, { fixedType: true }),
      shaftWidth: createSynchronizable(0, { fixedType: true }),
    }),
    [],
  );

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    let last = { frames: counters.frames.getDirty(), at: performance.now() };
    const id = setInterval(() => {
      const frames = counters.frames.getDirty();
      const at = performance.now();
      const fps = ((frames - last.frames) * 1000) / (at - last.at);
      last = { frames, at };
      setStats({
        fps,
        frames,
        landmarks: counters.landmarks.getDirty(),
        shaftWidth: counters.shaftWidth.getDirty(),
      });
    }, 1000);
    return () => clearInterval(id);
  }, [counters]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    pixelFormat: 'yuv',
    onFrame(frame) {
      'worklet';
      try {
        const p = pose.detect(frame);
        const s = shaft.detect(frame);
        counters.landmarks.setDirty(p.landmarks.length);
        counters.shaftWidth.setDirty(s.sourceWidth);
        counters.frames.setDirty(counters.frames.getDirty() + 1);
      } finally {
        frame.dispose();
      }
    },
  });

  return (
    <View style={styles.root}>
      {hasPermission && device != null ? (
        <Camera
          style={StyleSheet.absoluteFill}
          isActive
          device={device}
          outputs={[frameOutput]}
          constraints={[{ fps: TARGET_FPS }]}
          onSessionConfigSelected={(config) => setSelectedFps(config.selectedFPS)}
          onError={(e) => setError(e.message)}
        />
      ) : (
        <Text style={styles.line}>{hasPermission ? 'Ingen bakre kamera' : 'Väntar på kamerabehörighet'}</Text>
      )}
      <View style={styles.panel}>
        <Text style={styles.title}>SwingCheck · N-3.1 dev ({Platform.OS})</Text>
        <Text style={styles.line}>
          fps {stats.fps.toFixed(1)} (mål {TARGET_FPS}, session {selectedFps ?? '–'}) · rutor {stats.frames}
        </Text>
        <Text style={styles.line}>
          stubbar per ruta: pose {stats.landmarks} landmärken · skaft källbredd {stats.shaftWidth}
        </Text>
        <Text style={styles.line}>pose: {runtimes.pose}</Text>
        <Text style={styles.line}>shaft: {runtimes.shaft}</Text>
        <Text style={styles.line}>
          core: {core.rules} regler · envelope {core.valid ? 'giltig' : 'ogiltig'} {core.startSec.toFixed(3)}–
          {core.finishSec.toFixed(3)} s, impact {core.impactSec?.toFixed(3) ?? '–'} s · {core.ms.toFixed(1)} ms ·{' '}
          {core.matchesNode ? 'samma som Node ✔' : 'AVVIKER från Node ✘'}
        </Text>
        {error != null && <Text style={[styles.line, styles.error]}>kamera: {error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  panel: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, gap: 2 },
  title: { color: '#fff', fontWeight: '600' },
  line: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] },
  error: { color: '#ff8a80' },
});
