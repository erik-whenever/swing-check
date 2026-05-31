import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectLanguage } from '../lib/languages';
import type { Language } from '../lib/languages';
import type { CameraAngle } from '../lib/cameraAngle';

export type TtsMode = 'quick' | 'detailed';
export type { Language };

/** Color theme: 'system' follows the OS preference. */
export type Theme = 'system' | 'light' | 'dark';
/** Selectable accent hues — must match the [data-accent] palettes in index.css. */
export type Accent = 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';
export const ACCENTS: Accent[] = ['emerald', 'blue', 'violet', 'amber', 'rose'];

interface SettingsState {
  /** Color theme preference. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Accent hue. */
  accent: Accent;
  setAccent: (accent: Accent) => void;
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
  /** Countdown (seconds) before recording starts. 0 = start immediately. */
  countdownSeconds: number;
  setCountdownSeconds: (seconds: number) => void;
}

export const COUNTDOWN_MIN = 0;
export const COUNTDOWN_MAX = 15;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      accent: 'emerald',
      setAccent: (accent) => {
        document.documentElement.dataset.accent = accent;
        set({ accent });
      },
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
      countdownSeconds: 5,
      setCountdownSeconds: (seconds) =>
        set({
          countdownSeconds: Math.max(
            COUNTDOWN_MIN,
            Math.min(COUNTDOWN_MAX, Math.round(seconds)),
          ),
        }),
    }),
    { name: 'swingcheck-settings' }
  )
);

const systemPrefersDark = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

/** Resolve 'system' to the OS preference and write the data-theme attribute. */
function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
}

/**
 * Sync the <html> data-theme/data-accent attributes with the persisted settings
 * and keep 'system' in step with OS changes. Call once on app startup; an inline
 * script in index.html sets the attributes earlier to avoid a flash.
 */
export function initTheme() {
  const { theme, accent } = useSettingsStore.getState();
  applyTheme(theme);
  document.documentElement.dataset.accent = accent;

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (useSettingsStore.getState().theme === 'system') applyTheme('system');
    });
}
