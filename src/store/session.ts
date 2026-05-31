import { create } from 'zustand';
import type { SwingAnalysis } from '../types';
import type { FrameMeta } from '../lib/frameExtractor';
import type { CameraAngle } from '../lib/cameraAngle';

type View = 'home' | 'camera' | 'rules' | 'analysis' | 'history' | 'preview';

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
}));
