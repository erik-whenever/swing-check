import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectLanguage } from '../lib/languages';
import type { Language } from '../lib/languages';
import type { CameraAngle } from '../lib/cameraAngle';

export type TtsMode = 'quick' | 'detailed';
export type { Language };

interface SettingsState {
  /** Read analysis results aloud via Web Speech API. */
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  /** Quick = short verdict per rule. Detailed = full observation + drill. */
  ttsMode: TtsMode;
  setTtsMode: (mode: TtsMode) => void;
  /** UI language. */
  language: Language;
  setLanguage: (lang: Language) => void;
  /** True once the user has picked a language by hand — geo detection won't override it. */
  languageManual: boolean;
  /** Apply an auto-detected language, but only if the user hasn't chosen one. */
  applyDetectedLanguage: (lang: Language) => void;
  /** Globally-selected camera angle. Drives rule filtering across the whole app. */
  cameraAngle: CameraAngle;
  setCameraAngle: (angle: CameraAngle) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ttsEnabled: true,
      setTtsEnabled: (v) => set({ ttsEnabled: v }),
      ttsMode: 'quick',
      setTtsMode: (mode) => set({ ttsMode: mode }),
      language: detectLanguage(),
      setLanguage: (language) => set({ language, languageManual: true }),
      languageManual: false,
      applyDetectedLanguage: (language) =>
        set((s) => (s.languageManual ? s : { language })),
      cameraAngle: 'dtl',
      setCameraAngle: (cameraAngle) => set({ cameraAngle }),
    }),
    { name: 'swingcheck-settings' }
  )
);
