// N-3.2 dev screen: the pose module live on the camera thread, a skeleton over the preview
// (test O), a measuring run as in the spike ("30 · Starta 3 min": per-frame timings, dropped
// frames from timestamp gaps, thermal per second, a JSON log shared from the app) and parity
// against Python on a still (pose-android.md §7). Live counters are synchronizables that the
// frame thread writes and React reads a few times a second; only the measuring run sends one
// row per frame to the RN thread.
import { createPoseDetector, createPoseProbe, type PoseDelegate, type PoseDeviceInfo, type PoseModel } from '@swingcheck/native-pose';
import { createShaftDetector } from '@swingcheck/native-shaft';
import { File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { runCoreCheck } from './coreCheck';
import { gate, ROW_COLUMNS, round, summarize, type FrameRow, type ThermalSample } from './measure';
import { runParity, type ParityResult } from './parity';
import { createSessionClock, keepForCore, resetSessionClock, sessionTime, toPoseSample } from './poseFrames';
import { SkeletonOverlay, type BufferToView, type OverlayPose } from './SkeletonOverlay';

const TARGET_FPS = 30;
const RUN_SECONDS = 180;
const IS_ANDROID = Platform.OS === 'android';
type CameraPixelFormat = 'yuv' | 'rgb';

// One instance each for the app's lifetime. Created on the RN thread, used on the
// frame-processor thread (VisionCamera 5 docs, "Native Frame Processor Plugins").
const pose = createPoseDetector();
// Before the first frame can arrive (detect() throws until configured). The screen's choice
// replaces it in an effect.
pose.configure({ model: 'lite', delegate: 'gpu' });
const shaft = createShaftDetector();
// Android only: thermal, device, clock and parity helpers (not part of the iOS contract).
const probe = IS_ANDROID ? createPoseProbe() : null;

function nativeInfo(label: string, read: () => string): string {
  try {
    return read();
  } catch (e) {
    return `${label}: FEL ${e instanceof Error ? e.message : String(e)}`;
  }
}

function toRow(a: number[]): FrameRow {
  const [t, status, convertMs, inferMs, totalMs, rotation, delegate, rebuilds, ageRealtimeMs, ageUptimeMs, core] = a;
  return { t, status, convertMs, inferMs, totalMs, rotation, delegate, rebuilds, ageRealtimeMs, ageUptimeMs, core };
}

function Chip<T extends string>({ value, current, onPress, disabled }: { value: T; current: T; onPress: (v: T) => void; disabled?: boolean }) {
  const active = value === current;
  return (
    <Pressable
      onPress={() => onPress(value)}
      disabled={disabled}
      style={[styles.chip, active && styles.chipActive, disabled && !active && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
    </Pressable>
  );
}

export default function DevScreen() {
  useKeepAwake();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<CameraRef>(null);
  const [selectedFps, setSelectedFps] = useState<number | undefined>();
  const [uiRotation, setUiRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [model, setModel] = useState<PoseModel>('lite');
  const [delegate, setDelegate] = useState<PoseDelegate>('gpu');
  const [pixelFormat, setPixelFormat] = useState<CameraPixelFormat>('yuv');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState('');
  const [lastLog, setLastLog] = useState<File | null>(null);
  const [parity, setParity] = useState<ParityResult | null>(null);
  const [parityBusy, setParityBusy] = useState(false);
  const [overlay, setOverlay] = useState<{ pose: OverlayPose | null; map: BufferToView | null }>({ pose: null, map: null });
  const [stats, setStats] = useState({ fps: 0, frames: 0, coreFps: 0, status: '–', convertMs: 0, inferMs: 0, totalMs: 0, rotation: -1, delegate: '–', rebuilds: 0, width: 0, height: 0 });

  const core = useMemo(() => runCoreCheck(), []);
  const runtimes = useMemo(
    () => ({
      pose: nativeInfo('pose', () => pose.runtimeInfo()),
      shaft: nativeInfo('shaft', () => shaft.runtimeInfo()),
    }),
    [],
  );
  const deviceInfo = useMemo<PoseDeviceInfo | null>(() => {
    try {
      return probe?.deviceInfo() ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    pose.configure({ model, delegate });
  }, [model, delegate]);

  // Written on the frame thread, read here.
  const shared = useMemo(
    () => ({
      frames: createSynchronizable(0, { fixedType: true }),
      coreSamples: createSynchronizable(0, { fixedType: true }),
      status: createSynchronizable(-1, { fixedType: true }),
      convertMs: createSynchronizable(0, { fixedType: true }),
      inferMs: createSynchronizable(0, { fixedType: true }),
      totalMs: createSynchronizable(0, { fixedType: true }),
      rotation: createSynchronizable(-1, { fixedType: true }),
      delegate: createSynchronizable(-1, { fixedType: true }),
      rebuilds: createSynchronizable(0, { fixedType: true }),
      width: createSynchronizable(0, { fixedType: true }),
      height: createSynchronizable(0, { fixedType: true }),
      measuring: createSynchronizable(false, { fixedType: true }),
      /** [rotation, x0, y0, …, x32, y32] of the latest frame with a pose, [] otherwise. */
      overlay: createSynchronizable<number[]>([]),
      /** Sensor points of the buffer corners (0,0), (W,0), (0,H): [x0, y0, x1, y1, x2, y2]. */
      corners: createSynchronizable<number[]>([]),
      clock: createSessionClock(),
    }),
    [],
  );

  const rows = useRef<FrameRow[]>([]);
  const thermal = useRef<ThermalSample[]>([]);
  const startedAt = useRef(0);
  const onRow = useCallback((a: number[]) => {
    rows.current.push(toRow(a));
  }, []);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // 1 Hz: fps and the latest per-frame values.
  useEffect(() => {
    let last = { frames: shared.frames.getDirty(), core: shared.coreSamples.getDirty(), at: performance.now() };
    const id = setInterval(() => {
      const frames = shared.frames.getDirty();
      const coreSamples = shared.coreSamples.getDirty();
      const at = performance.now();
      const dt = (at - last.at) / 1000;
      const status = shared.status.getDirty();
      setStats({
        fps: (frames - last.frames) / dt,
        coreFps: (coreSamples - last.core) / dt,
        frames,
        status: status === 0 ? 'ok' : status === 1 ? 'ingen pose' : status === 2 ? 'FEL' : '–',
        convertMs: shared.convertMs.getDirty(),
        inferMs: shared.inferMs.getDirty(),
        totalMs: shared.totalMs.getDirty(),
        rotation: shared.rotation.getDirty(),
        delegate: shared.delegate.getDirty() === 0 ? 'gpu' : shared.delegate.getDirty() === 1 ? 'cpu' : '–',
        rebuilds: shared.rebuilds.getDirty(),
        width: shared.width.getDirty(),
        height: shared.height.getDirty(),
      });
      last = { frames, core: coreSamples, at };
    }, 1000);
    return () => clearInterval(id);
  }, [shared]);

  // ~12 Hz: the skeleton. Paused during a measuring run so it does not compete for the CPU.
  useEffect(() => {
    if (running) return;
    const id = setInterval(() => {
      const o = shared.overlay.getDirty();
      const c = shared.corners.getDirty();
      let map: BufferToView | null = null;
      const view = cameraRef.current;
      if (view != null && c.length === 6) {
        try {
          map = {
            o: view.convertCameraPointToViewPoint({ x: c[0], y: c[1] }),
            u: view.convertCameraPointToViewPoint({ x: c[2], y: c[3] }),
            v: view.convertCameraPointToViewPoint({ x: c[4], y: c[5] }),
          };
        } catch {
          map = null; // preview not ready yet
        }
      }
      setOverlay({ pose: o.length === 67 ? { rotation: o[0], xy: o.slice(1) } : null, map });
    }, 80);
    return () => clearInterval(id);
  }, [shared, running]);

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    pixelFormat,
    // 'yuv': the module rotates in its libyuv pass (ADR-0004). 'rgb' is the comparison run 6:
    // CameraX converts and rotates, the module only copies.
    enablePhysicalBufferRotation: pixelFormat === 'rgb',
    onFrame(frame) {
      'worklet';
      try {
        const r = pose.detect(frame);
        const ok = r.status === 'ok';
        // N-3.4: t comes from capture.append(frame), called first (poseFrames.ts).
        const t = sessionTime(shared.clock, r.frameTimeSec);
        const toCore = keepForCore(shared.clock, t);
        if (toCore) {
          // What N-3.4 hands to core (liveSwingDetector): 15 fps, unpacked only here.
          toPoseSample(t, ok, r.landmarks);
          shared.coreSamples.setDirty(shared.coreSamples.getDirty() + 1);
        }
        const frames = shared.frames.getDirty() + 1;
        shared.frames.setDirty(frames);
        shared.status.setDirty(ok ? 0 : r.status === 'no-pose' ? 1 : 2);
        shared.convertMs.setDirty(r.convertMs);
        shared.inferMs.setDirty(r.inferenceMs);
        shared.totalMs.setDirty(r.totalMs);
        shared.rotation.setDirty(r.rotationDegrees);
        shared.delegate.setDirty(r.delegate === 'gpu' ? 0 : 1);
        const rebuilds = pose.rebuilds;
        shared.rebuilds.setDirty(rebuilds);

        if (shared.measuring.getDirty()) {
          const c = probe?.clock();
          scheduleOnRN(onRow, [
            t,
            ok ? 0 : r.status === 'no-pose' ? 1 : 2,
            r.convertMs,
            r.inferenceMs,
            r.totalMs,
            r.rotationDegrees,
            r.delegate === 'gpu' ? 0 : 1,
            rebuilds,
            c ? (c.elapsedRealtimeSec - r.frameTimeSec) * 1000 : -1,
            c ? (c.uptimeSec - r.frameTimeSec) * 1000 : -1,
            toCore ? 1 : 0,
          ]);
        } else {
          if (ok) {
            const f = new Float32Array(r.landmarks);
            const xy: number[] = [r.rotationDegrees];
            for (let i = 0; i < 33; i++) xy.push(f[4 * i], f[4 * i + 1]);
            shared.overlay.setBlocking(xy);
          } else {
            shared.overlay.setBlocking([]);
          }
          if (frames % 15 === 1) {
            const w = frame.width;
            const h = frame.height;
            shared.width.setDirty(w);
            shared.height.setDirty(h);
            const a = frame.convertFramePointToCameraPoint({ x: 0, y: 0 });
            const b = frame.convertFramePointToCameraPoint({ x: w, y: 0 });
            const d = frame.convertFramePointToCameraPoint({ x: 0, y: h });
            shared.corners.setBlocking([a.x, a.y, b.x, b.y, d.x, d.y]);
          }
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const summary = useCallback(() => summarize(rows.current, thermal.current, TARGET_FPS), []);

  const stop = useCallback(() => {
    shared.measuring.setBlocking(false);
    setRunning(false);
  }, [shared]);

  // 1 Hz while running: thermal, live readout, auto-stop.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const t = (Date.now() - startedAt.current) / 1000;
      const th = probe?.thermal() ?? { status: 'unknown', headroom: -1 };
      thermal.current.push({ t: round(t, 0), status: th.status, headroom: round(th.headroom, 3) });
      setElapsed(t);
      const s = summary();
      if (s) {
        setLive(
          [
            `fps ${s.actualFps ?? '–'} · tappade ${s.droppedAfterWarmup} efter ${2} s (${s.droppedPctAfterWarmup ?? '–'} %) · träff ${s.hitRate}`,
            s.totalMs ? `total ${s.totalMs.median} / p95 ${s.totalMs.p95} / p99 ${s.totalMs.p99} ms` : '',
            s.convertMs && s.inferMs ? `convert ${s.convertMs.median} · infer ${s.inferMs.median} ms (median)` : '',
            `thermal ${th.status} headroom ${th.headroom.toFixed(2)} (max ${s.thermalMax})`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      if (t >= RUN_SECONDS) stop();
    }, 1000);
    return () => clearInterval(id);
  }, [running, summary, stop]);

  const writeLog = useCallback(() => {
    const s = summary();
    const log = {
      kind: 'swingcheck-n3.2-pose',
      writtenAt: new Date().toISOString(),
      device: { platform: Platform.OS, ...deviceInfo },
      config: {
        model,
        requestedDelegate: delegate,
        cameraPixelFormat: pixelFormat,
        physicalBufferRotation: pixelFormat === 'rgb',
        targetFps: TARGET_FPS,
        sessionFps: selectedFps ?? null,
        frameOutputResolution: frameOutput.currentResolution ?? null,
        poseInputLongSide: pixelFormat === 'yuv' ? 1280 : null,
        runSeconds: RUN_SECONDS,
        overlayDuringRun: false,
        runtime: runtimes.pose,
      },
      summary: s,
      gate: s ? gate(s, RUN_SECONDS) : null,
      parity,
      thermal: thermal.current,
      // One row per frame. status 0 ok / 1 no-pose / 2 error, delegate 0 gpu / 1 cpu, core 1 = kept for core (15 fps).
      columns: ROW_COLUMNS,
      rows: rows.current.map((r) => [
        round(r.t, 4),
        r.status,
        round(r.convertMs, 2),
        round(r.inferMs, 2),
        round(r.totalMs, 2),
        r.rotation,
        r.delegate,
        r.rebuilds,
        round(r.ageRealtimeMs, 1),
        round(r.ageUptimeMs, 1),
        r.core,
      ]),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File(Paths.document, `pose-${Platform.OS}-${model}-${delegate}-${pixelFormat}-${stamp}.json`);
    file.write(JSON.stringify(log));
    setLastLog(file);
  }, [summary, deviceInfo, model, delegate, pixelFormat, selectedFps, frameOutput, runtimes, parity]);

  // Write the log when a run ends (auto-stop or Stopp).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) writeLog();
    wasRunning.current = running;
  }, [running, writeLog]);

  const start = () => {
    rows.current = [];
    startedAt.current = Date.now();
    const th = probe?.thermal() ?? { status: 'unknown', headroom: -1 };
    thermal.current = [{ t: 0, status: th.status, headroom: round(th.headroom, 3) }];
    setLive('');
    setElapsed(0);
    resetSessionClock(shared.clock); // a run is a session: its first frame is t = 0
    shared.measuring.setBlocking(true);
    setRunning(true);
  };

  const share = async () => {
    if (lastLog == null) return;
    await Sharing.shareAsync(lastLog.uri, { mimeType: 'application/json', dialogTitle: 'Dela pose-logg' });
  };

  const checkParity = async () => {
    if (probe == null) return;
    setParityBusy(true);
    try {
      setParity(await runParity(probe));
    } catch (e) {
      setParity({ ok: false, message: `FEL ${e instanceof Error ? e.message : String(e)}`, limits: { xy: 0, visibility: 0 }, runs: [] });
    } finally {
      setParityBusy(false);
    }
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      {hasPermission && device != null ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          isActive
          device={device}
          outputs={[frameOutput]}
          constraints={[{ fps: TARGET_FPS }]}
          onSessionConfigSelected={(config) => setSelectedFps(config.selectedFPS)}
          onUIRotationChanged={setUiRotation}
          onError={(e) => setError(e.message)}
        />
      ) : (
        <Text style={styles.line}>{hasPermission ? 'Ingen bakre kamera' : 'Väntar på kamerabehörighet'}</Text>
      )}
      <SkeletonOverlay pose={running ? null : overlay.pose} map={overlay.map} />
      <View style={styles.panel}>
        <Text style={styles.title}>SwingCheck · N-3.2 pose ({Platform.OS})</Text>
        <Text style={styles.line}>
          fps {stats.fps.toFixed(1)} (mål {TARGET_FPS}, session {selectedFps ?? '–'}) · rutor {stats.frames} · core {stats.coreFps.toFixed(1)} fps
        </Text>
        <Text style={styles.line}>
          pose {stats.status} · {stats.delegate} · convert {stats.convertMs.toFixed(1)} · infer {stats.inferMs.toFixed(1)} · total{' '}
          {stats.totalMs.toFixed(1)} ms · ombyggen {stats.rebuilds}
        </Text>
        <Text style={styles.line}>
          ruta {stats.width}×{stats.height} rot {stats.rotation}° · UI-rotation {uiRotation}°
          {uiRotation !== 0 ? ' ⚠ slå på autorotation, annars hamnar skelettet fel' : ''}
        </Text>
        {deviceInfo != null && (
          <Text style={styles.line}>
            {deviceInfo.manufacturer} {deviceInfo.model} · {deviceInfo.socManufacturer} {deviceInfo.socModel} · {deviceInfo.glRenderer} ·
            klocka {deviceInfo.timestampSources} · modell {deviceInfo.modelLoad}
          </Text>
        )}
        <View style={styles.row}>
          {(['lite', 'full'] as const).map((v) => (
            <Chip key={v} value={v} current={model} onPress={setModel} disabled={running} />
          ))}
          <View style={styles.gap} />
          {(['gpu', 'cpu'] as const).map((v) => (
            <Chip key={v} value={v} current={delegate} onPress={setDelegate} disabled={running} />
          ))}
          <View style={styles.gap} />
          {(['yuv', 'rgb'] as const).map((v) => (
            <Chip key={v} value={v} current={pixelFormat} onPress={setPixelFormat} disabled={running || !IS_ANDROID} />
          ))}
        </View>
        <View style={styles.row}>
          <Pressable style={[styles.button, running && styles.buttonStop]} onPress={running ? stop : start}>
            <Text style={styles.buttonText}>{running ? `Stopp ${mmss(elapsed)}` : `${TARGET_FPS} · Starta ${RUN_SECONDS / 60} min`}</Text>
          </Pressable>
          <Pressable style={[styles.button, lastLog == null && styles.chipDisabled]} onPress={share} disabled={lastLog == null}>
            <Text style={styles.buttonText}>Dela logg</Text>
          </Pressable>
          <Pressable style={[styles.button, (running || parityBusy || !IS_ANDROID) && styles.chipDisabled]} onPress={checkParity} disabled={running || parityBusy || !IS_ANDROID}>
            <Text style={styles.buttonText}>{parityBusy ? 'Paritet …' : 'Paritet'}</Text>
          </Pressable>
        </View>
        {live !== '' && <Text style={styles.line}>{live}</Text>}
        {parity != null && (
          <Text style={[styles.line, !parity.ok && styles.error]}>
            paritet: {parity.message}
            {parity.runs.map(
              (r) =>
                `\n  ${r.model} ${r.delegate}${r.viaYuv ? '+yuv' : ''}: ${r.status} max ${r.maxXY.toExponential(1)} (${r.maxXYPx} px, punkt ${r.worstIndex}) vis ${r.maxVisibility.toExponential(1)} · ${r.inferenceMs} ms${r.gated ? (r.pass ? ' ✔' : ' ✘') : ''}`,
            )}
          </Text>
        )}
        <Text style={styles.line}>pose: {runtimes.pose}</Text>
        <Text style={styles.line}>
          shaft: {runtimes.shaft} · core: {core.rules} regler, {core.matchesNode ? 'samma som Node ✔' : 'AVVIKER från Node ✘'}
        </Text>
        {lastLog != null && <Text style={styles.line}>logg: {lastLog.name}</Text>}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
  gap: { width: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff88' },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: '#fff', fontSize: 12 },
  chipTextActive: { color: '#000', fontWeight: '600' },
  button: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: '#2e7d32' },
  buttonStop: { backgroundColor: '#c62828' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
