// Upload → analysis pipeline (N-3.6 del 12): picked clip → key frames → Worker → history.
//
// Pure orchestration, no expo imports: every side effect (frame grab, analysis call, media
// storage, saving) is injected, so the steps, progress and cancellation are tested with
// mocks (uploadPipeline.test.ts). The expo implementations live in uploadAdapters.ts.
//
// Interim (no Mac yet): frames come from a FrameSource that grabs stills at chosen times
// (expo-video-thumbnails). N-3.4 (native `capture`) and N-3.8 (Swift pose) replace that
// source and the even spacing below with pose-based phase selection — same interface.

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import type { Rule, SwingAnalysis } from '@swingcheck/core/types';
import type { HistoryEntry } from '../state/historyModel';

// Structural copies of AnalysisScreen's step types and UploadScreen's SwingWindow: the screens
// are .tsx (react-native), which the expo-free test build cannot import. containers.tsx passes
// these straight to the screens, so the app's tsc catches any drift.
type AnalysisStepId = 'swing' | 'frames' | 'rules' | 'shaft';
interface AnalysisStepState {
  status: 'pending' | 'active' | 'done';
  detail?: string;
}
/** Seconds within the clip. */
export interface SwingWindow {
  start: number;
  end: number;
}

export interface PipelineProgress {
  steps: Partial<Record<AnalysisStepId, AnalysisStepState>>;
  progress: number;
  remainingSeconds: number | null;
}

/** True now that the pipeline exists; "Bedöm svingen" is enabled once a clip is picked. */
export const UPLOAD_PIPELINE_AVAILABLE = true;

/**
 * Frames per swing — mirrors the web's ANALYSIS_FRAME_COUNT (src/lib/frameExtractor.ts),
 * which lives outside core so it cannot be imported here.
 */
// OSÄKER: the web sends 32 pose-CROPPED frames (~220 tokens each). These are uncropped
// (≤1280 px, like the web's motion fallback), so a swing costs ~5× the input tokens until
// N-3.8 brings the crop. Risk: medium — cost per upload, not correctness; the Worker caps it.
export const UPLOAD_FRAME_COUNT = 32;
/** Longest edge capped at 1280 px, JPEG quality 0.8. */
export const FRAME_MAX_EDGE = 1280;
export const FRAME_JPEG_QUALITY = 0.8;

/**
 * The resize that caps a frame's longest edge, or null when it already fits. Capping only the
 * width let a portrait iPhone clip (1080×1920, 2160×3840) through at full height: 32 frames came
 * to 37 MB and the Worker answered 413 (BODY_MAX_BYTES 30 MB).
 */
export function frameResize(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= FRAME_MAX_EDGE) return null;
  return width >= height ? { width: FRAME_MAX_EDGE } : { height: FRAME_MAX_EDGE };
}
/** A clip at most this long is analysed whole when the user has not set a window. */
export const DEFAULT_WINDOW_MAX_SEC = 4;

export interface PickedClip {
  uri: string;
  /** Seconds. */
  duration: number;
  /** Shown in the clip chip, e.g. "IMG_4127". */
  name: string;
}

export interface FrameGrab {
  /** Raw base64 JPEG (no data: prefix) — what core's analyzeSwing sends. */
  base64: string;
  /** Local file of the same frame, kept for the history (poster, phase strip). */
  uri: string;
}

/** Where key frames come from. Interim: thumbnails at given times; later N-3.4 `capture`. */
export interface FrameSource {
  grab(clipUri: string, timeSec: number): Promise<FrameGrab>;
}

export interface UploadDeps {
  frames: FrameSource;
  analyze: (
    frames: string[],
    rules: Rule[],
    options: { cameraAngle: CameraAngle; language: AnalysisLanguage },
  ) => Promise<SwingAnalysis>;
  /** Copy the clip and frames into app storage for entry `id`; returns their lasting URIs. */
  persistMedia: (id: string, clipUri: string, frameUris: string[]) => Promise<{ videoUri: string | null; frameUris: string[] }>;
  addSwing: (entry: HistoryEntry) => Promise<void>;
  newId: () => string;
  now: () => number;
}

export interface UploadJob {
  clip: PickedClip;
  window: SwingWindow;
  angle: CameraAngle;
  rules: Rule[];
  language: AnalysisLanguage;
}

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload analysis cancelled');
    this.name = 'UploadCancelledError';
  }
}

/** The idle state AnalysisScreen shows before the pipeline starts. */
export function idleProgress(): PipelineProgress {
  return { steps: {}, progress: 0, remainingSeconds: null };
}

/** The window used when the user has not set one: the whole clip if short, else its middle. */
// OSÄKER: without pose (N-3.8) there is no swing detection; for a long clip the middle
// DEFAULT_WINDOW_MAX_SEC is a guess the user adjusts on the timeline. Risk: medium — a wrong
// window gives frames without the swing; the user sees and drags the window before analysing.
export function defaultSwingWindow(duration: number): SwingWindow {
  if (!(duration > 0)) return { start: 0, end: 0 };
  if (duration <= DEFAULT_WINDOW_MAX_SEC) return { start: 0, end: duration };
  const start = (duration - DEFAULT_WINDOW_MAX_SEC) / 2;
  return { start, end: start + DEFAULT_WINDOW_MAX_SEC };
}

/** Clamp a window to the clip; an empty/inverted one falls back to the default. */
export function clampWindow(window: SwingWindow | null, duration: number): SwingWindow {
  if (!window) return defaultSwingWindow(duration);
  const start = Math.max(0, Math.min(window.start, duration));
  const end = Math.max(0, Math.min(window.end, duration));
  return end > start ? { start, end } : defaultSwingWindow(duration);
}

/**
 * Frame times (s) inside the window, evenly spaced, both ends included.
 */
// OSÄKER: core's phase-aware selection (selectEnvelopeFrames) needs pose samples, which the
// app cannot produce until N-3.8. Even spacing over the user's window is the stand-in.
// Risk: medium — fewer frames land in the fast downswing/impact than the pose path gives;
// the prompt is told the frame count and judges from what it sees.
export function selectFrameTimes(window: SwingWindow, count: number = UPLOAD_FRAME_COUNT): number[] {
  const n = Math.max(1, Math.floor(count));
  const span = Math.max(0, window.end - window.start);
  if (n === 1 || span === 0) return [window.start];
  // Stay a hair inside the end: a still exactly at the clip's duration may not decode.
  const end = window.start + span * 0.999;
  return Array.from({ length: n }, (_, i) => window.start + ((end - window.start) * i) / (n - 1));
}

function fmtSec(s: number): string {
  return s.toFixed(1).replace('.', ',');
}

/** Analysis results as the history stores them: focus rule first, like the web. */
export function resultsOf(analysis: SwingAnalysis): HistoryEntry['results'] {
  return [...(analysis.focus_rule ? [analysis.focus_rule] : []), ...analysis.rules];
}

/**
 * Runs one upload analysis and saves it. Resolves with the new history entry's id.
 * Progress follows AnalysisScreen's steps: swing (window) → frames → rules (Worker).
 * Aborting stops before the next step; a Worker answer that arrives after an abort is
 * dropped (core's fetch takes no signal) and nothing is saved.
 */
export async function runUploadAnalysis(
  job: UploadJob,
  deps: UploadDeps,
  onProgress: (p: PipelineProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const check = () => {
    if (signal?.aborted) throw new UploadCancelledError();
  };
  const window = clampWindow(job.window, job.clip.duration);
  const times = selectFrameTimes(window);
  const ruleDetail = `${job.rules.length} st`;
  const steps: PipelineProgress['steps'] = {
    swing: { status: 'done', detail: `${fmtSec(window.start)}–${fmtSec(window.end)} s` },
    frames: { status: 'active', detail: `0 / ${times.length}` },
  };
  // OSÄKER: estimates are rough (≈0.15 s per frame grab, ≈15 s Worker round trip).
  // Risk: low — display only.
  const emit = (progress: number, remainingSeconds: number | null) =>
    onProgress({ steps: { ...steps }, progress, remainingSeconds });
  emit(0.05, Math.round(times.length * 0.15 + 15));

  check();
  const grabs: FrameGrab[] = [];
  for (let i = 0; i < times.length; i++) {
    check();
    grabs.push(await deps.frames.grab(job.clip.uri, times[i]));
    steps.frames = { status: 'active', detail: `${i + 1} / ${times.length}` };
    emit(0.05 + 0.35 * ((i + 1) / times.length), Math.round((times.length - i - 1) * 0.15 + 15));
  }
  steps.frames = { status: 'done', detail: `${grabs.length} st` };
  steps.rules = { status: 'active', detail: ruleDetail };
  emit(0.45, 15);

  check();
  const analysis = await deps.analyze(
    grabs.map((g) => g.base64),
    job.rules,
    { cameraAngle: job.angle, language: job.language },
  );
  check();
  steps.rules = { status: 'done', detail: ruleDetail };
  emit(0.9, 2);

  const id = deps.newId();
  const media = await deps.persistMedia(id, job.clip.uri, grabs.map((g) => g.uri));
  check();
  await deps.addSwing({
    id,
    timestamp: deps.now(),
    videoUri: media.videoUri,
    frameUris: media.frameUris,
    results: resultsOf(analysis),
    overallAssessment: analysis.overall_assessment,
    focusRuleId: analysis.focus_rule?.id,
    cameraAngle: job.angle,
    ruleIds: job.rules.map((r) => r.libraryId ?? r.id),
    language: job.language,
  });
  emit(1, 0);
  return id;
}
