// The N-3.2 measuring run: per-frame rows → summary and the N-2 gate (pose-android.md §7).
// Numeric helpers follow apps/spike/src/stats.ts, plus p99 and per-minute medians.

export interface Spread {
  n: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}

export function spread(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
  return { n: s.length, median: round(at(0.5), 2), p95: round(at(0.95), 2), p99: round(at(0.99), 2), max: round(s[s.length - 1], 2) };
}

export const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Frames the camera never delivered, read off the gaps between delivered timestamps
 * (onFrameDropped is not implemented on Android in VC 5.2.3). A gap > 1.5 intervals of k
 * intervals means k − 1 dropped frames.
 */
export function droppedFrames(timesSec: number[], fps: number): number {
  const interval = 1 / fps;
  let dropped = 0;
  for (let i = 1; i < timesSec.length; i++) {
    const gap = timesSec[i] - timesSec[i - 1];
    if (gap > 1.5 * interval) dropped += Math.round(gap / interval) - 1;
  }
  return dropped;
}

/** One frame. `t` is s since the run's first frame (frameTimeSec − origin). */
export interface FrameRow {
  t: number;
  /** 0 ok, 1 no-pose, 2 error */
  status: number;
  convertMs: number;
  inferMs: number;
  totalMs: number;
  rotation: number;
  /** 0 gpu, 1 cpu */
  delegate: number;
  rebuilds: number;
  /** elapsedRealtime − frameTimeSec right after detect, ms (test T: which clock the frames use). */
  ageRealtimeMs: number;
  /** uptime − frameTimeSec, ms. */
  ageUptimeMs: number;
  /** 1 when the frame was kept for core (15 fps). */
  core: number;
  /** N-3.2 diagnosis (PoseProbe.lastFrame): inferMs = wrapMs + detectMs. */
  wrapMs: number;
  detectMs: number;
  packMs: number;
  /** Cores of the camera thread at detect() and of the inference thread after it, -1 unknown. */
  callerCpu: number;
  inferenceCpu: number;
  inferenceNice: number;
}

export const ROW_COLUMNS = [
  't',
  'status',
  'convertMs',
  'inferMs',
  'totalMs',
  'rotation',
  'delegate',
  'rebuilds',
  'ageRealtimeMs',
  'ageUptimeMs',
  'core',
  'wrapMs',
  'detectMs',
  'packMs',
  'callerCpu',
  'inferenceCpu',
  'inferenceNice',
] as const;

/** {core: share of frames} for the frames that had a known core. */
function coreShare(values: number[]): Record<string, number> {
  const known = values.filter((v) => v >= 0);
  const out: Record<string, number> = {};
  for (const v of known) out[v] = (out[v] ?? 0) + 1;
  for (const k of Object.keys(out)) out[k] = round(out[k] / known.length, 3);
  return out;
}

export interface ThermalSample {
  t: number;
  status: string;
  headroom: number;
}

export const THERMAL_RANK: Record<string, number> = {
  unknown: -1,
  none: 0,
  light: 1,
  moderate: 2,
  severe: 3,
  critical: 4,
  emergency: 5,
  shutdown: 6,
};

/** Uppvärmningen räknas separat (mätning 1–2 på iPhone): tappade rutor räknas efter 2 s. */
export const WARMUP_SEC = 2;

export function summarize(rows: FrameRow[], thermal: ThermalSample[], fps: number) {
  if (rows.length === 0) return null;
  const times = rows.map((r) => r.t);
  const spanS = times[times.length - 1] - times[0];
  const after = rows.filter((r) => r.t >= WARMUP_SEC);
  const droppedAll = droppedFrames(times, fps);
  const droppedAfter = droppedFrames(
    after.map((r) => r.t),
    fps,
  );
  const ok = rows.filter((r) => r.status === 0);
  const timed = rows.filter((r) => r.status !== 2);
  const minutes = [0, 1, 2].map((m) => spread(timed.filter((r) => r.t >= m * 60 && r.t < (m + 1) * 60).map((r) => r.totalMs)));
  const thermalMax = thermal.reduce((m, x) => (THERMAL_RANK[x.status] > THERMAL_RANK[m] ? x.status : m), 'unknown');
  const headrooms = thermal.map((x) => x.headroom).filter((h) => h >= 0);
  const ages = rows.map((r) => r.ageRealtimeMs);
  const uptimeAges = rows.map((r) => r.ageUptimeMs);
  return {
    frames: rows.length,
    spanS: round(spanS, 1),
    actualFps: spanS > 0 ? round((rows.length - 1) / spanS, 2) : null,
    droppedFrames: droppedAll,
    droppedAfterWarmup: droppedAfter,
    droppedPctAfterWarmup: after.length ? round((100 * droppedAfter) / (after.length + droppedAfter), 2) : null,
    errors: rows.length - timed.length,
    hitRate: round(ok.length / rows.length, 3),
    coreFps: spanS > 0 ? round(rows.filter((r) => r.core).length / spanS, 2) : null,
    totalMs: spread(timed.map((r) => r.totalMs)),
    convertMs: spread(timed.map((r) => r.convertMs)),
    inferMs: spread(timed.map((r) => r.inferMs)),
    noPoseInferMs: spread(rows.filter((r) => r.status === 1).map((r) => r.inferMs)),
    wrapMs: spread(timed.map((r) => r.wrapMs)),
    detectMs: spread(timed.map((r) => r.detectMs)),
    packMs: spread(timed.map((r) => r.packMs)),
    callerCpu: coreShare(timed.map((r) => r.callerCpu)),
    inferenceCpu: coreShare(timed.map((r) => r.inferenceCpu)),
    inferenceNice: [...new Set(timed.map((r) => r.inferenceNice))],
    totalMsPerMinute: minutes.map((m) => (m ? m.median : null)),
    delegates: [...new Set(rows.map((r) => (r.delegate === 0 ? 'gpu' : 'cpu')))],
    rotations: [...new Set(rows.map((r) => r.rotation))],
    rebuilds: rows[rows.length - 1].rebuilds,
    thermalMax,
    headroomMax: headrooms.length ? round(Math.max(...headrooms), 3) : null,
    clock: {
      ageRealtimeMs: spread(ages),
      ageUptimeMs: spread(uptimeAges),
    },
  };
}

export type Summary = NonNullable<ReturnType<typeof summarize>>;

/** The N-2 gate, as on the iPhone (pose-android.md §7). */
export function gate(s: Summary, runSec: number) {
  const [m1, , m3] = s.totalMsPerMinute;
  const checks = {
    fullRun: s.spanS >= runSec - 1,
    p99Under33: s.totalMs != null && s.totalMs.p99 < 33,
    droppedUnder1Pct: s.droppedPctAfterWarmup != null && s.droppedPctAfterWarmup < 1,
    thermalNeverSevere: THERMAL_RANK[s.thermalMax] < THERMAL_RANK.severe,
    noTrend: m1 != null && m3 != null && m3 <= m1 * 1.2,
    hitRate93: s.hitRate >= 0.93,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}
