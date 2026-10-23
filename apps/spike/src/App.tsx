// N-2 measuring view. Two kinds of build (app.config.ts): `pose` runs MediaPipe Pose (native
// plugin) per camera frame; `shaft` runs shaft-v2 (TFLite, Core ML / Android GPU) per frame,
// plus a burst of 26 frames back to back — the product's real pattern (the shaft runs on ~26
// frames per swing after the shot, not live). They cannot share one iOS binary: MediaPipe and
// fast-tflite both carry TFLite's C API (duplicate TfLite* symbols).
//
// Timings per frame, dropped frames, actual fps and thermal state over a 3-minute run, logged
// to a JSON file that can be shared from the app. No product UI.

import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type * as FastTflite from 'react-native-fast-tflite';
import type { TensorflowModel, TensorflowModelDelegate } from 'react-native-fast-tflite';
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
import type * as ResizePlugin from 'vision-camera-resize-plugin';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';
import { runParity, type ParityResult } from './parity';
import { droppedFrames, round, spread, THERMAL_RANK, type Spread } from './stats';

// The build kind comes from the NATIVE bundle id (…spike.lite / .full / .shaft), not from the
// app config: a dev client reads its config from Metro on the PC, whose env may not match.
const VARIANT = (Application.applicationId ?? '').split('.').pop() ?? '';
const SPIKE: 'pose' | 'shaft' = VARIANT === 'shaft' ? 'shaft' : 'pose';
const POSE_MODEL = SPIKE === 'pose' ? VARIANT : null;

// Only the shaft build links these. Requiring them in the pose build would call into native
// modules that are not there, so they are loaded conditionally and the hooks are swapped once
// per build (stable, so the rules of hooks hold).
/* eslint-disable @typescript-eslint/no-require-imports */
const tflite: typeof FastTflite | null = SPIKE === 'shaft' ? require('react-native-fast-tflite') : null;
const resizer: typeof ResizePlugin | null = SPIKE === 'shaft' ? require('vision-camera-resize-plugin') : null;
const SHAFT_MODEL = require('../assets/models/shaft-v2-float32.tflite');
/* eslint-enable @typescript-eslint/no-require-imports */

type ShaftState = { model?: TensorflowModel; state: string; error?: Error };
const useShaftModel: (d: TensorflowModelDelegate) => ShaftState = tflite
  ? (d) => tflite.useTensorflowModel(SHAFT_MODEL, d)
  : () => ({ state: 'ej i bygget' });
type Resize = ReturnType<typeof ResizePlugin.useResizePlugin>['resize'];
const useResize: () => { resize: Resize | null } = resizer ? resizer.useResizePlugin : () => ({ resize: null });

const posePlugin = SPIKE === 'pose' ? VisionCameraProxy.initFrameProcessorPlugin('poseLandmarker', {}) : undefined;

const RUN_SECONDS = 180;
/** Frames per swing the product runs the shaft on (after the shot, from the clip). */
const BURST_FRAMES = 26;
const SIZE = 960;
const PAD = 114 / 255;
const IS_ANDROID = Platform.OS === 'android';
const ACCELERATED: TensorflowModelDelegate = IS_ANDROID ? 'android-gpu' : 'core-ml';

interface Sample {
  ts: number;
  poseMs: number;
  prepMs: number;
  inferMs: number;
  posed: number;
  shaftConf: number;
}

interface BurstRaw {
  id: number;
  /** Wall time from the first frame's prep to the last frame's inference, ms. */
  totalMs: number;
  prepMs: number[];
  inferMs: number[];
}

interface Burst {
  id: number;
  at: string;
  delegate: string;
  thermal: string;
  totalMs: number;
  prepMs: Spread | null;
  inferMs: Spread | null;
  firstInferMs: number;
}

type WorkletGlobals = {
  __lb?: Float32Array;
  __lbKey?: string;
  __burstDone?: number;
  __burstFrames?: Uint8Array[];
  __burstGeom?: { dw: number; dh: number; px: number; py: number };
};

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

  const [delegate, setDelegate] = useState<TensorflowModelDelegate>(ACCELERATED);
  const shaft = useShaftModel(delegate);
  const model = shaft.state === 'loaded' ? shaft.model : undefined;
  const { resize } = useResize();

  const [running, setRunning] = useState(false);
  const [burstId, setBurstId] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<string>('');
  const [parity, setParity] = useState<ParityResult | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
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

  const onBurst = useRunOnJS(
    (b: BurstRaw) => {
      setBursts((prev) => [
        ...prev,
        {
          id: b.id,
          at: new Date().toISOString(),
          delegate: model?.delegate ?? delegate,
          thermal: getCurrentThermalState(),
          totalMs: round(b.totalMs, 1),
          prepMs: spread(b.prepMs),
          inferMs: spread(b.inferMs),
          firstInferMs: round(b.inferMs[0], 1),
        },
      ]);
    },
    [model, delegate],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const g = globalThis as unknown as WorkletGlobals;
      const W = frame.width;
      const H = frame.height;
      // Letterbox exactly like core/lib/shaft/letterbox.ts (Ultralytics' rounding).
      // OSÄKER: bufferten skickas som den kommer från sensorn, utan rotation. Med telefonen
      // liggande står golfaren upprätt; i porträtt ligger hen ner och träffgraden faller.
      // Tiden per ruta påverkas knappt — den beror på tensorstorleken, inte innehållet.
      const scale = Math.min(SIZE / W, SIZE / H);
      const dw = Math.round(W * scale);
      const dh = Math.round(H * scale);
      const px = Math.max(0, Math.round((SIZE - dw) / 2 - 0.1));
      const py = Math.max(0, Math.round((SIZE - dh) / 2 - 0.1));
      const letterboxInto = (src: Float32Array | Uint8Array, toUnit: number) => {
        const key = `${dw}x${dh}`;
        if (g.__lb == null || g.__lbKey !== key) {
          g.__lb = new Float32Array(SIZE * SIZE * 3);
          g.__lb.fill(PAD);
          g.__lbKey = key;
        }
        const buf = g.__lb;
        if (toUnit === 1 && px === 0) {
          buf.set(src as Float32Array, py * SIZE * 3);
        } else {
          for (let y = 0; y < dh; y++) {
            const from = y * dw * 3;
            const to = ((y + py) * SIZE + px) * 3;
            for (let i = 0; i < dw * 3; i++) buf[to + i] = src[from + i] * toUnit;
          }
        }
        return buf;
      };

      // --- Burst: capture BURST_FRAMES consecutive frames, then run them back to back. ---
      if (model != null && resize != null && burstId > 0 && g.__burstDone !== burstId) {
        if (g.__burstFrames == null || g.__burstFrames.length >= BURST_FRAMES) g.__burstFrames = [];
        const raw = resize(frame, {
          crop: { x: 0, y: 0, width: W, height: H },
          scale: { width: dw, height: dh },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });
        g.__burstFrames.push(new Uint8Array(raw));
        g.__burstGeom = { dw, dh, px, py };
        if (g.__burstFrames.length === BURST_FRAMES) {
          // The product decodes the swing's frames from the clip and runs the shaft on each in
          // turn; here prep = uint8 → letterboxed float32, inference = runSync. The camera
          // thread is blocked meanwhile; frames dropped during the burst do not count.
          const prepMs: number[] = [];
          const inferMs: number[] = [];
          const t0 = performance.now();
          for (const f of g.__burstFrames) {
            const a = performance.now();
            const input = letterboxInto(f, 1 / 255);
            const b = performance.now();
            model.runSync([input]);
            const c = performance.now();
            prepMs.push(b - a);
            inferMs.push(c - b);
          }
          const totalMs = performance.now() - t0;
          g.__burstDone = burstId;
          g.__burstFrames = [];
          onBurst({ id: burstId, totalMs, prepMs, inferMs });
        }
        return;
      }

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
      if (posePlugin != null) {
        const t0 = performance.now();
        const lms = posePlugin.call(frame) as unknown;
        poseMs = performance.now() - t0;
        posed = Array.isArray(lms) && lms.length >= 33 ? 1 : 0;
      }

      if (model != null && resize != null) {
        const t0 = performance.now();
        const resized = resize(frame, {
          crop: { x: 0, y: 0, width: W, height: H },
          scale: { width: dw, height: dh },
          pixelFormat: 'rgb',
          dataType: 'float32',
        });
        const input = letterboxInto(resized, 1);
        const t1 = performance.now();
        const out = model.runSync([input])[0] as Float32Array;
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
    [running, burstId, model, resize, onSample, onBurst],
  );

  const summarize = useCallback(() => {
    const s = samples.current;
    if (s.length === 0) return null;
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
      droppedPct: round((100 * dropped) / (s.length + dropped), 2),
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
      if (sum) {
        setLive(
          [
            `fps ${sum.actualFps ?? '–'}  tappade ${sum.droppedFrames} (${sum.droppedPct} %)`,
            sum.poseMs ? `pose ${round(sum.poseMs.median)} / p95 ${round(sum.poseMs.p95)} ms  träff ${sum.poseHitRate}` : '',
            sum.shaftInferMs
              ? `skaft ${round(sum.shaftInferMs.median)} / p95 ${round(sum.shaftInferMs.p95)} ms (+prep ${round(sum.shaftPrepMs!.median)})  träff ${sum.shaftHitRate}`
              : '',
            `thermal ${thermal.current[thermal.current.length - 1].state} (max ${sum.thermalMax})`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      if (t >= RUN_SECONDS) setRunning(false);
    }, 1000);
    return () => clearInterval(id);
  }, [running, summarize]);

  const writeLog = useCallback(() => {
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
        spike: SPIKE,
        applicationId: Application.applicationId,
        targetFps,
        cameraFps: fps,
        format: format
          ? { width: format.videoWidth, height: format.videoHeight, maxFps: format.maxFps }
          : null,
        poseModel: POSE_MODEL ? `pose_landmarker_${POSE_MODEL}` : null,
        shaftModel: SPIKE === 'shaft' ? 'shaft-v2-float32.tflite' : null,
        shaftDelegate: SPIKE === 'shaft' ? (model?.delegate ?? delegate) : null,
        runSeconds: RUN_SECONDS,
        burstFrames: BURST_FRAMES,
      },
      summary: summarize(),
      parity,
      bursts,
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
    const file = new File(Paths.document, `spike-${Platform.OS}-${VARIANT}-${stamp}.json`);
    file.write(JSON.stringify(log));
    setLastLog(file);
  }, [summarize, targetFps, fps, format, model, delegate, parity, bursts]);

  // Write the log when a run ends (auto-stop or Stopp) and after every burst.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) writeLog();
    wasRunning.current = running;
  }, [running, writeLog]);
  const loggedBursts = useRef(0);
  useEffect(() => {
    if (bursts.length > loggedBursts.current) {
      loggedBursts.current = bursts.length;
      writeLog();
    }
  }, [bursts, writeLog]);

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

  const burstBusy = burstId > 0 && bursts[bursts.length - 1]?.id !== burstId;
  const lastBurst = bursts[bursts.length - 1];

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
          {Device.modelName} · {SPIKE === 'pose' ? `pose_landmarker_${POSE_MODEL}` : `skaft ${shaft.state}${model ? ` (${model.delegate})` : ''}`}
          {' '}· core: {RULE_LIBRARY.length} regler
        </Text>
        <Text style={styles.text}>
          format {format ? `${format.videoWidth}×${format.videoHeight} ≤${format.maxFps} fps` : '–'} · kör {fps} fps
          {SPIKE === 'pose' && posePlugin == null ? ' · POSE-PLUGIN SAKNAS' : ''}
        </Text>
        <View style={styles.row}>
          <Btn label="30" on={targetFps === 30} disabled={running} onPress={() => setTargetFps(30)} />
          <Btn label="60" on={targetFps === 60} disabled={running} onPress={() => setTargetFps(60)} />
          {SPIKE === 'shaft' ? (
            <>
              <Btn label={ACCELERATED} on={delegate === ACCELERATED} disabled={running || burstBusy} onPress={() => setDelegate(ACCELERATED)} />
              <Btn label="cpu" on={delegate === 'default'} disabled={running || burstBusy} onPress={() => setDelegate('default')} />
            </>
          ) : null}
        </View>
        <View style={styles.row}>
          {running ? (
            <Btn label={`Stopp (${Math.round(elapsed)} / ${RUN_SECONDS} s)`} onPress={() => setRunning(false)} />
          ) : (
            <Btn label={`Starta ${RUN_SECONDS / 60} min`} disabled={burstBusy} onPress={start} />
          )}
          {SPIKE === 'shaft' ? (
            <>
              <Btn label="Paritet" disabled={running || burstBusy || !model} onPress={doParity} />
              <Btn label={burstBusy ? 'Burst …' : `Burst ${BURST_FRAMES}`} disabled={running || burstBusy || !model} onPress={() => setBurstId((n) => n + 1)} />
            </>
          ) : null}
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
        {lastBurst ? (
          <Text style={styles.text}>
            burst {bursts.length}× ({lastBurst.delegate}): senast {lastBurst.totalMs} ms för {BURST_FRAMES} rutor ·
            inferens {lastBurst.inferMs ? round(lastBurst.inferMs.median) : '–'} / p95 {lastBurst.inferMs ? round(lastBurst.inferMs.p95) : '–'} ms ·
            prep {lastBurst.prepMs ? round(lastBurst.prepMs.median) : '–'} ms · första {lastBurst.firstInferMs} ms
          </Text>
        ) : null}
        {lastLog ? <Text style={styles.text}>logg: {lastLog.name}</Text> : null}
        {error || shaft.state === 'error' ? (
          <Text style={[styles.text, styles.error]}>{error ?? String(shaft.error)}</Text>
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
