// N-2 measuring view: camera at 30/60 fps, MediaPipe Pose (native plugin) and shaft-v2
// (TFLite, Core ML / Android GPU delegate) in the frame processor. Timings per frame,
// dropped frames, actual fps and thermal state over a 3-minute run, logged to a JSON file
// that can be shared from the app. No product UI.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTensorflowModel, type TensorflowModelDelegate } from 'react-native-fast-tflite';
import { getCurrentThermalState } from 'react-native-nitro-thermal';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import { useRunOnJS } from 'react-native-worklets-core';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';
import { runParity, type ParityResult } from './parity';
import { droppedFrames, round, spread, THERMAL_RANK } from './stats';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SHAFT_MODEL = require('../assets/models/shaft-v2-float32.tflite');

type Mode = 'pose' | 'shaft' | 'both';
const RUN_SECONDS = 180;
const SIZE = 960;
const PAD = 114 / 255;
const IS_ANDROID = Platform.OS === 'android';
const ACCELERATED: TensorflowModelDelegate = IS_ANDROID ? 'android-gpu' : 'core-ml';
const POSE_MODEL: string = Constants.expoConfig?.extra?.poseModel ?? 'lite';

const posePlugin = VisionCameraProxy.initFrameProcessorPlugin('poseLandmarker', {});

interface Sample {
  ts: number;
  poseMs: number;
  prepMs: number;
  inferMs: number;
  posed: number;
  shaftConf: number;
}

export default function App() {
  useKeepAwake();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [targetFps, setTargetFps] = useState<30 | 60>(30);
  const format = useCameraFormat(device, [
    { fps: targetFps },
    { videoResolution: { width: 1920, height: 1080 } },
  ]);
  const fps = format ? Math.min(targetFps, format.maxFps) : targetFps;

  const [mode, setMode] = useState<Mode>('pose');
  const [delegate, setDelegate] = useState<TensorflowModelDelegate>(ACCELERATED);
  const shaft = useTensorflowModel(SHAFT_MODEL, delegate);
  const model = shaft.state === 'loaded' ? shaft.model : undefined;
  const { resize } = useResizePlugin();

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<string>('');
  const [parity, setParity] = useState<ParityResult | null>(null);
  const [lastLog, setLastLog] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const samples = useRef<Sample[]>([]);
  const thermal = useRef<{ t: number; state: string }[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const onSample = useRunOnJS((s: Sample) => {
    samples.current.push(s);
  }, []);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (!running) return;
      // OSÄKER: VisionCamera 4 ger frame.timestamp i ms på iOS och ns på Android (så läser
      // pose-pluginet det också). Fel enhet ger fel fps och tappade rutor, inte fel ms/ruta.
      const ts = IS_ANDROID ? frame.timestamp / 1e6 : frame.timestamp;
      let poseMs = -1;
      let prepMs = -1;
      let inferMs = -1;
      let posed = 0;
      let shaftConf = -1;

      // OSÄKER: pluginet kör MediaPipe med trösklar 0,3 (webben: bibliotekets standard 0,5)
      // och GPU-delegat. Lägre tröskel kan ge fler spårade rutor men ändrar inte modellens kostnad.
      if (mode !== 'shaft' && posePlugin != null) {
        const t0 = performance.now();
        const lms = posePlugin.call(frame) as unknown;
        poseMs = performance.now() - t0;
        posed = Array.isArray(lms) && lms.length >= 33 ? 1 : 0;
      }

      if (mode !== 'pose' && model != null) {
        const t0 = performance.now();
        // Letterbox exactly like core/lib/shaft/letterbox.ts (Ultralytics' rounding).
        // OSÄKER: bufferten skickas som den kommer från sensorn, utan rotation. Med telefonen
        // liggande står golfaren upprätt; i porträtt ligger hen ner och träffgraden faller.
        // Tiden per ruta påverkas knappt — den beror på tensorstorleken, inte innehållet.
        const W = frame.width;
        const H = frame.height;
        const scale = Math.min(SIZE / W, SIZE / H);
        const dw = Math.round(W * scale);
        const dh = Math.round(H * scale);
        const px = Math.max(0, Math.round((SIZE - dw) / 2 - 0.1));
        const py = Math.max(0, Math.round((SIZE - dh) / 2 - 0.1));
        const resized = resize(frame, {
          crop: { x: 0, y: 0, width: W, height: H },
          scale: { width: dw, height: dh },
          pixelFormat: 'rgb',
          dataType: 'float32',
        });
        const g = globalThis as unknown as { __lb?: Float32Array; __lbKey?: string };
        const key = `${dw}x${dh}`;
        if (g.__lb == null || g.__lbKey !== key) {
          g.__lb = new Float32Array(SIZE * SIZE * 3);
          g.__lb.fill(PAD);
          g.__lbKey = key;
        }
        const buf = g.__lb;
        if (px === 0) {
          buf.set(resized, py * SIZE * 3);
        } else {
          for (let y = 0; y < dh; y++) {
            buf.set(resized.subarray(y * dw * 3, (y + 1) * dw * 3), ((y + py) * SIZE + px) * 3);
          }
        }
        const t1 = performance.now();
        const out = model.runSync([buf])[0] as Float32Array;
        const t2 = performance.now();
        prepMs = t1 - t0;
        inferMs = t2 - t1;
        // Box confidence row (channel 4 of [1, 11, 18900]) — enough to say "club found".
        let best = 0;
        const n = out.length / 11;
        for (let i = 4 * n; i < 5 * n; i++) if (out[i] > best) best = out[i];
        shaftConf = best;
      }

      onSample({ ts, poseMs, prepMs, inferMs, posed, shaftConf });
    },
    [running, mode, model, resize, onSample],
  );

  const summarize = useCallback(() => {
    const s = samples.current;
    const ts = s.map((x) => x.ts);
    const spanS = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : 0;
    const dropped = droppedFrames(ts, fps);
    const pose = s.filter((x) => x.poseMs >= 0);
    const sh = s.filter((x) => x.inferMs >= 0);
    const maxThermal = thermal.current.reduce(
      (m, x) => (THERMAL_RANK[x.state] > THERMAL_RANK[m] ? x.state : m),
      'unknown',
    );
    return {
      frames: s.length,
      spanS: round(spanS, 1),
      actualFps: spanS > 0 ? round((s.length - 1) / spanS, 2) : null,
      droppedFrames: dropped,
      droppedPct: s.length ? round((100 * dropped) / (s.length + dropped), 2) : null,
      poseMs: spread(pose.map((x) => x.poseMs)),
      poseHitRate: pose.length ? round(pose.filter((x) => x.posed).length / pose.length, 3) : null,
      shaftPrepMs: spread(sh.map((x) => x.prepMs)),
      shaftInferMs: spread(sh.map((x) => x.inferMs)),
      shaftHitRate: sh.length ? round(sh.filter((x) => x.shaftConf >= 0.25).length / sh.length, 3) : null,
      thermalMax: maxThermal,
    };
  }, [fps]);

  // 1 Hz: thermal sample, live readout, auto-stop.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const t = (Date.now() - startedAt.current) / 1000;
      thermal.current.push({ t: round(t, 0), state: getCurrentThermalState() });
      setElapsed(t);
      const sum = summarize();
      setLive(
        [
          `fps ${sum.actualFps ?? '–'}  tappade ${sum.droppedFrames} (${sum.droppedPct ?? '–'} %)`,
          sum.poseMs ? `pose ${round(sum.poseMs.median)} / p95 ${round(sum.poseMs.p95)} ms  träff ${sum.poseHitRate}` : '',
          sum.shaftInferMs
            ? `skaft ${round(sum.shaftInferMs.median)} / p95 ${round(sum.shaftInferMs.p95)} ms (+prep ${round(sum.shaftPrepMs!.median)})  träff ${sum.shaftHitRate}`
            : '',
          `thermal ${thermal.current[thermal.current.length - 1].state} (max ${sum.thermalMax})`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
      if (t >= RUN_SECONDS) setRunning(false);
    }, 1000);
    return () => clearInterval(id);
  }, [running, summarize]);

  const writeLog = useCallback(() => {
    const summary = summarize();
    const log = {
      kind: 'swingcheck-spike-n2',
      writtenAt: new Date().toISOString(),
      device: {
        platform: Platform.OS,
        model: Device.modelName,
        modelId: Device.modelId,
        os: `${Device.osName} ${Device.osVersion}`,
      },
      config: {
        mode,
        targetFps,
        cameraFps: fps,
        format: format
          ? { width: format.videoWidth, height: format.videoHeight, maxFps: format.maxFps }
          : null,
        poseModel: `pose_landmarker_${POSE_MODEL}`,
        shaftModel: 'shaft-v2-float32.tflite',
        shaftDelegate: model?.delegate ?? delegate,
        runSeconds: RUN_SECONDS,
      },
      summary,
      parity,
      thermal: thermal.current,
      // Columns: ts (ms), poseMs, prepMs, inferMs, posed, shaftConf. -1 = not run this frame.
      samples: samples.current.map((s) => [
        round(s.ts, 2),
        round(s.poseMs, 2),
        round(s.prepMs, 2),
        round(s.inferMs, 2),
        s.posed,
        round(s.shaftConf, 3),
      ]),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File(Paths.document, `spike-${Platform.OS}-${POSE_MODEL}-${mode}-${stamp}.json`);
    file.write(JSON.stringify(log));
    setLastLog(file);
  }, [summarize, mode, targetFps, fps, format, model, delegate, parity]);

  // Write the log when a run ends (auto-stop or Stopp).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) writeLog();
    wasRunning.current = running;
  }, [running, writeLog]);

  const start = () => {
    samples.current = [];
    thermal.current = [{ t: 0, state: getCurrentThermalState() }];
    startedAt.current = Date.now();
    setElapsed(0);
    setLive('');
    setRunning(true);
  };

  const doParity = async () => {
    if (!model) return;
    setError(null);
    try {
      setParity(await runParity(model));
    } catch (e) {
      setError(String(e));
    }
  };

  if (!hasPermission) return <Text style={styles.text}>Väntar på kameratillstånd…</Text>;
  if (device == null) return <Text style={styles.text}>Ingen bakre kamera.</Text>;

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={fps}
        isActive
        pixelFormat="rgb"
        frameProcessor={frameProcessor}
      />
      <ScrollView style={styles.panel}>
        <Text style={styles.text}>
          {Device.modelName} · pose_landmarker_{POSE_MODEL} · skaft {shaft.state}
          {model ? ` (${model.delegate})` : ''} · core: {RULE_LIBRARY.length} regler
        </Text>
        <Text style={styles.text}>
          format {format ? `${format.videoWidth}×${format.videoHeight} ≤${format.maxFps} fps` : '–'} · kör {fps} fps
          {posePlugin == null ? ' · POSE-PLUGIN SAKNAS' : ''}
        </Text>
        <View style={styles.row}>
          {(['pose', 'shaft', 'both'] as Mode[]).map((m) => (
            <Btn key={m} label={m === 'pose' ? 'Pose' : m === 'shaft' ? 'Skaft' : 'Båda'} on={mode === m} disabled={running} onPress={() => setMode(m)} />
          ))}
          <Btn label="30" on={targetFps === 30} disabled={running} onPress={() => setTargetFps(30)} />
          <Btn label="60" on={targetFps === 60} disabled={running} onPress={() => setTargetFps(60)} />
          <Btn label={ACCELERATED} on={delegate === ACCELERATED} disabled={running} onPress={() => setDelegate(ACCELERATED)} />
          <Btn label="cpu" on={delegate === 'default'} disabled={running} onPress={() => setDelegate('default')} />
        </View>
        <View style={styles.row}>
          {running ? (
            <Btn label={`Stopp (${Math.round(elapsed)} / ${RUN_SECONDS} s)`} onPress={() => setRunning(false)} />
          ) : (
            <Btn label={`Starta ${RUN_SECONDS / 60} min`} onPress={start} />
          )}
          <Btn label="Paritet" disabled={running || !model} onPress={doParity} />
          <Btn label="Dela logg" disabled={running || !lastLog} onPress={() => lastLog && Sharing.shareAsync(lastLog.uri)} />
        </View>
        {live ? <Text style={styles.text}>{live}</Text> : null}
        {parity ? (
          <Text style={styles.text}>
            paritet ({parity.delegate}): max {parity.maxSourcePx ?? '–'} px ·{' '}
            {Object.entries(parity.deviation)
              .map(([k, d]) => `${k} ${d.sourcePx} px`)
              .join(', ')}{' '}
            · box {parity.boxConf?.app}/{parity.boxConf?.python} · stillbild {parity.inferMs ? round(parity.inferMs.median) : '–'} ms
          </Text>
        ) : null}
        {lastLog ? <Text style={styles.text}>logg: {lastLog.name}</Text> : null}
        {error || shaft.state === 'error' ? (
          <Text style={[styles.text, styles.error]}>{error ?? String((shaft as { error?: Error }).error)}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Btn(props: { label: string; on?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.btn, props.on && styles.btnOn, props.disabled && styles.btnOff]}
    >
      <Text style={styles.btnText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '55%', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  text: { color: '#fff', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginVertical: 2 },
  error: { color: '#f66' },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: '#333' },
  btnOn: { backgroundColor: '#2a6' },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 12 },
});
