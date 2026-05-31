import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { SwingAnalysis } from '../types';
import type { FrameMeta } from '../lib/frameExtractor';
import type { CameraAngle } from '../lib/cameraAngle';

type View = 'home' | 'camera' | 'rules' | 'analysis' | 'history' | 'preview' | 'settings';

interface SessionState {
  view: View;
  setView: (view: View) => void;
  focusRuleId: string | null;
  setFocusRuleId: (id: string | null) => void;
  currentVideoBlob: Blob | null;
  setCurrentVideoBlob: (blob: Blob | null) => void;
  currentFrames: string[];
  setCurrentFrames: (frames: string[]) => void;
  currentFrameMeta: FrameMeta[];
  setCurrentFrameMeta: (meta: FrameMeta[]) => void;
  currentAnalysis: SwingAnalysis | null;
  setCurrentAnalysis: (analysis: SwingAnalysis | null) => void;
  /** Camera angle the current swing was analyzed with (captured at analysis time). */
  analysisAngle: CameraAngle | null;
  setAnalysisAngle: (angle: CameraAngle | null) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (v: boolean) => void;

  // ── Hands-free session mode (multi-swing without touching the app) ──
  /** True while a range session is running. */
  sessionActive: boolean;
  /** Id grouping all swings recorded in the current session. */
  sessionId: string | null;
  /** 1-based index of the swing currently being recorded/analyzed. */
  swingNumber: number;
  /** Set after analysis to signal the camera view to auto-start the next recording. */
  autoRecordPending: boolean;
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
  currentFrames: [],
  setCurrentFrames: (frames) => set({ currentFrames: frames }),
  currentFrameMeta: [],
  setCurrentFrameMeta: (meta) => set({ currentFrameMeta: meta }),
  currentAnalysis: null,
  setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),
  analysisAngle: null,
  setAnalysisAngle: (analysisAngle) => set({ analysisAngle }),
  isAnalyzing: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  sessionActive: false,
  sessionId: null,
  swingNumber: 0,
  autoRecordPending: false,
  startSession: () =>
    set({ sessionActive: true, sessionId: uuid(), swingNumber: 0, autoRecordPending: false }),
  endSession: () =>
    set({ sessionActive: false, sessionId: null, swingNumber: 0, autoRecordPending: false }),
  beginSwing: () => set((s) => ({ swingNumber: s.swingNumber + 1 })),
  requestAutoRecord: () => set({ autoRecordPending: true }),
  clearAutoRecord: () => set({ autoRecordPending: false }),
}));
