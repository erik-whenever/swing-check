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
  /** voiceURI of the user-picked TTS voice. null = auto-select the best Swedish voice. */
  ttsVoiceURI: string | null;
  setTtsVoiceURI: (uri: string | null) => void;
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
  /**
   * Ultra-wide lens (0.5× zoom) on the rear camera. The whole swing only fits at
   * a distance that is awkward on a range; 0.5× roughly halves it. Applied to the
   * live track, never by switching device — see `lib/cameraZoom.ts`.
   */
  wideAngle: boolean;
  setWideAngle: (v: boolean) => void;
  /**
   * Session mode only: analyze a detected swing ONLY when its envelope carries a
   * confident impact (`envelope.impact !== null`).
   *
   * The gate exists because a false detection — walking past the camera — costs the
   * same as a real swing and more: the stretched envelope makes the pose crop box
   * cover nearly the whole frame, so the images are the most expensive ones we ever
   * send. Production logs put one such detection at $0.0408, ahead of real swings in
   * the serial queue, and read aloud in the headphones. Every false detection so far
   * has `impactSec === null`; every real swing has a confident impact.
   *
   * Defaults on, and is a setting rather than a constant because the discriminator is
   * a field hypothesis: if the range shows it rejecting real swings, it can be turned
   * off without a deploy. The clip path in AnalysisView is NOT gated — there the user
   * explicitly asked for an analysis (worst-case-wins).
   */
  requireImpact: boolean;
  setRequireImpact: (v: boolean) => void;
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
      ttsVoiceURI: null,
      setTtsVoiceURI: (uri) => set({ ttsVoiceURI: uri }),
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
      wideAngle: false,
      setWideAngle: (wideAngle) => set({ wideAngle }),
      requireImpact: true,
      setRequireImpact: (requireImpact) => set({ requireImpact }),
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
