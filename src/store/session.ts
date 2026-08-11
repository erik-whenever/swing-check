import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { SwingAnalysis } from '../types';
import type { FrameMeta } from '../lib/frameExtractor';
import type { CameraAngle } from '../lib/cameraAngle';
import { sessionStats, type SessionSummary } from '../lib/sessionStats';

type View = 'home' | 'camera' | 'rules' | 'analysis' | 'history' | 'preview' | 'settings';

/**
 * Lifecycle of ONE swing (ADR-003 §5.4). Per swing, not per session — that is the
 * whole point of the list below: swing N+1 can be `detected` while N is still
 * `analyzing`, which the old singular `isAnalyzing` boolean made impossible.
 *
 *   detected   — segmented/recorded, boundaries known, no frames grabbed yet
 *   extracting — frames are being grabbed for this swing
 *   analyzing  — frames sent to Claude Vision, waiting for the verdict
 *   done       — `analysis` is populated
 *   failed     — `error` is populated; terminal until the swing is discarded
 *   skipped    — deliberately not analyzed (no confident impact, see `requireImpact`
 *                in store/settings.ts). Distinct from `failed`: nothing went wrong,
 *                the swing was judged not to be a swing before any cost was incurred.
 */
export type SwingStatus =
  | 'detected'
  | 'extracting'
  | 'analyzing'
  | 'done'
  | 'failed'
  | 'skipped';

/**
 * The latency chain for one swing, measured from its anchor (impact when confident,
 * else envelope start) in milliseconds. Null until that stage is reached; a stage
 * that never completes stays null rather than being back-filled with a guess.
 *
 * This is the whole point of the session mode being worth building or not: how long
 * after hitting the ball the golfer hears something. Kept on the swing rather than
 * in a log line so the session view can show it and Erik can read the chain per
 * swing without filtering a log.
 */
export interface SwingTimings {
  /** Anchor in recording-clock seconds — the zero every figure below is from. */
  anchorSec: number;
  /** Anchor → the live detector accepted the swing (structural ~0.6–1.1 s). */
  detectedMs: number;
  /** Anchor → analysis frames grabbed and ready to send. */
  framesMs: number | null;
  /** Anchor → Claude Vision verdict in hand. */
  analysisMs: number | null;
  /** Anchor → spoken feedback finished. */
  spokenMs: number | null;
}

/** One swing inside the current session, with its own independent lifecycle. */
export interface SessionSwing {
  id: string;
  status: SwingStatus;
  /**
   * `[start, finish]` in source-clip seconds. Null until known. In the
   * single-swing flow this is derived from the selected frames (see
   * `swingFromExtraction`); once segmentation drives capture it comes straight
   * from `DetectedSwing.envelope`.
   */
  envelopeSec: [number, number] | null;
  /** Impact in source-clip seconds, or null when it was not confidently found. */
  impactSec: number | null;
  /** Base64 JPEGs sent to Claude Vision. */
  frames: string[];
  /** Per-frame metadata for the dev preview (score, phase, timestamp). */
  frameMeta: FrameMeta[];
  analysis: SwingAnalysis | null;
  /** Failure message when `status === 'failed'`. */
  error: string | null;
  /** Latency chain (D-5 pass 3). Null on the clip path, which has no anchor clock. */
  timings: SwingTimings | null;
}

interface SessionState {
  view: View;
  setView: (view: View) => void;
  focusRuleId: string | null;
  setFocusRuleId: (id: string | null) => void;
  currentVideoBlob: Blob | null;
  setCurrentVideoBlob: (blob: Blob | null) => void;

  /**
   * Every swing in the current session, in capture order. The single-swing flow
   * keeps exactly one entry here and the single-swing views render `swings[0]`
   * (see `selectPrimarySwing`).
   */
  swings: SessionSwing[];
  /** Append a swing and return its id. Fields not given take safe defaults. */
  addSwing: (init?: Partial<Omit<SessionSwing, 'id'>>) => string;
  /** Patch one swing by id. Unknown ids are a no-op. */
  updateSwing: (id: string, patch: Partial<Omit<SessionSwing, 'id'>>) => void;
  removeSwing: (id: string) => void;
  clearSwings: () => void;

  /** Camera angle the current swing was analyzed with (captured at analysis time). */
  analysisAngle: CameraAngle | null;
  setAnalysisAngle: (angle: CameraAngle | null) => void;

  // ── Hands-free session mode (multi-swing without touching the app) ──
  /** True while a range session is running. */
  sessionActive: boolean;
  /** Id grouping all swings recorded in the current session. */
  sessionId: string | null;
  /** 1-based index of the swing currently being recorded/analyzed. */
  swingNumber: number;
  /** Set after analysis to signal the camera view to auto-start the next recording. */
  autoRecordPending: boolean;
  /**
   * True when the browser silently swallowed the first thing we tried to say —
   * iOS Safari refusing speechSynthesis outside a user gesture. Set from the
   * speech watchdog (see `primeSpeech` in lib/tts.ts), cleared by any gesture
   * that re-primes the engine. Lives here rather than in settings because it is
   * a transient fact about this page load, not a preference to persist.
   */
  speechBlocked: boolean;
  setSpeechBlocked: (v: boolean) => void;
  /**
   * Summary of the session that just ended (see `lib/sessionStats.ts`). Kept so the
   * numbers survive the session being torn down and can be read on the phone at the
   * range without opening the log panel. Cleared by the next session, or by hand.
   */
  lastSummary: SessionSummary | null;
  clearLastSummary: () => void;
  startSession: () => void;
  endSession: () => void;
  /** Increment the swing counter (called when a new recording begins). */
  beginSwing: () => void;
  requestAutoRecord: () => void;
  clearAutoRecord: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),
  focusRuleId: null,
  setFocusRuleId: (id) => set({ focusRuleId: id }),
  currentVideoBlob: null,
  setCurrentVideoBlob: (blob) => set({ currentVideoBlob: blob }),

  swings: [],
  addSwing: (init) => {
    const swing: SessionSwing = {
      id: uuid(),
      status: 'detected',
      envelopeSec: null,
      impactSec: null,
      frames: [],
      frameMeta: [],
      analysis: null,
      error: null,
      timings: null,
      ...init,
    };
    set((s) => ({ swings: [...s.swings, swing] }));
    return swing.id;
  },
  updateSwing: (id, patch) =>
    set((s) => ({
      swings: s.swings.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  removeSwing: (id) => set((s) => ({ swings: s.swings.filter((w) => w.id !== id) })),
  clearSwings: () => set({ swings: [] }),

  analysisAngle: null,
  setAnalysisAngle: (analysisAngle) => set({ analysisAngle }),

  sessionActive: false,
  sessionId: null,
  swingNumber: 0,
  autoRecordPending: false,
  speechBlocked: false,
  setSpeechBlocked: (speechBlocked) => set({ speechBlocked }),
  lastSummary: null,
  clearLastSummary: () => set({ lastSummary: null }),
  startSession: () => {
    // Zero the field-test statistics here rather than at the first swing: a session
    // that detected nothing is itself a result, and its duration is part of it.
    sessionStats.begin();
    set({
      sessionActive: true,
      sessionId: uuid(),
      swingNumber: 0,
      autoRecordPending: false,
      speechBlocked: false,
      lastSummary: null,
    });
  },
  endSession: () =>
    set((s) => ({
      sessionActive: false,
      sessionId: null,
      swingNumber: 0,
      autoRecordPending: false,
      // `end()` logs the WARN line and returns null if no session was running, so a
      // second call (the headset double-press and the button can both land) keeps
      // the first summary instead of replacing it with an empty one.
      lastSummary: sessionStats.end() ?? s.lastSummary,
    })),
  beginSwing: () => set((s) => ({ swingNumber: s.swingNumber + 1 })),
  requestAutoRecord: () => set({ autoRecordPending: true }),
  clearAutoRecord: () => set({ autoRecordPending: false }),
}));

// ── Selectors ────────────────────────────────────────────────────────────────
// Plain functions so components can pass them straight to `useSessionStore(...)`.
// Each returns either a primitive or an object identity that only changes when
// the underlying swing does, so they are safe as subscription selectors.

/** The swing the single-swing views render. Null before anything is captured. */
export const selectPrimarySwing = (s: SessionState): SessionSwing | null =>
  s.swings[0] ?? null;

/**
 * True while ANY swing is mid-flight. Replaces the old global `isAnalyzing`
 * for the cases that genuinely are session-wide: disabling capture controls and
 * gating the hands-free auto-record loop. Per-swing UI must read
 * `swing.status` instead — that distinction is why the boolean was removed.
 */
export const selectAnySwingBusy = (s: SessionState): boolean =>
  s.swings.some((w) => w.status === 'extracting' || w.status === 'analyzing');

/**
 * Build the swing fields a finished `extractFrames` run implies.
 *
 * `frameExtractor.ts` returns frames only — it does not surface the envelope it
 * selected them from, and D-5 pass 1 deliberately does not touch that file. So
 * the boundaries here are DERIVED: `envelopeSec` is the span of the selected
 * frames (which equals the envelope on the pose path and the motion window on
 * the pixel-diff fallback), and `impactSec` is the timestamp of the frame the
 * selector labelled `impact` — null when it did not label one, which is exactly
 * when the envelope had no confident impact (ADR-002: impact is polish, never
 * load-bearing). Pass 2 replaces this with the real `DetectedSwing` values.
 */
export function swingFromExtraction(
  frames: string[],
  frameMeta: FrameMeta[],
): Pick<SessionSwing, 'frames' | 'frameMeta' | 'envelopeSec' | 'impactSec'> {
  const times = frameMeta
    .map((m) => m.timeSec)
    .filter((t): t is number => typeof t === 'number');
  return {
    frames,
    frameMeta,
    envelopeSec: times.length > 0 ? [Math.min(...times), Math.max(...times)] : null,
    impactSec: frameMeta.find((m) => m.phase === 'impact')?.timeSec ?? null,
  };
}
