import { useEffect } from 'react';
import { useSessionStore } from './store/session';
import { useSettingsStore } from './store/settings';
import { detectLanguageByGeo } from './lib/geo';
import { HomeView } from './components/Home/HomeView';
import { CameraView } from './components/Camera/CameraView';
import { RuleEditor } from './components/Rules/RuleEditor';
import { AnalysisView } from './components/Analysis/AnalysisView';
import { HistoryList } from './components/History/HistoryList';
import { SettingsView } from './components/Settings/SettingsView';
import { FramePreview } from './components/Analysis/FramePreview';
import { Toast } from './components/Toast';
import { NavBar } from './components/NavBar';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import { useOnboardingStore } from './store/onboarding';
import { useT } from './lib/i18n';
import { DevLogPanel } from './components/DevLogPanel';
import { UpdateBanner } from './components/UpdateBanner';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

/** Minimal 24×24 stroke icons (inherit currentColor) so each tab reads at a glance. */
const icons = {
  home: 'M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
  camera: 'M4 8a2 2 0 0 1 2-2h1l1.2-1.6a1 1 0 0 1 .8-.4h6a1 1 0 0 1 .8.4L18 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  rules: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  analysis: 'M4 19V5M4 15l4-4 4 3 8-8',
  history: 'M3.5 9a9 9 0 1 1-1 4M3 5v4h4M12 8v4l3 2',
} as const;

const tabs = [
  { key: 'home', labelKey: 'nav.home' },
  { key: 'camera', labelKey: 'nav.camera' },
  { key: 'rules', labelKey: 'nav.rules' },
  { key: 'analysis', labelKey: 'nav.analysis' },
  { key: 'history', labelKey: 'nav.history' },
] as const;

function App() {
  const t = useT();
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);
  const sessionActive = useSessionStore((s) => s.sessionActive);
  const onboarded = useOnboardingStore((s) => s.completed);

  // During a hands-free session we keep the camera mounted underneath the analysis
  // overlay so its stream, headset audio loop and Media Session handlers survive the
  // round-trip and the next swing can auto-record without re-acquiring permissions.
  const keepCameraMounted = view === 'camera' || (sessionActive && view === 'analysis');

  // Refine the language from the visitor's location once on startup. Browser-locale
  // detection runs synchronously in the store; this overrides it only when the user
  // hasn't manually chosen a language (handled inside applyDetectedLanguage).
  useEffect(() => {
    const controller = new AbortController();
    detectLanguageByGeo(controller.signal).then((lang) => {
      if (lang) useSettingsStore.getState().applyDetectedLanguage(lang);
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col h-full max-w-[430px] mx-auto bg-bg">
      {/* Persistent top nav: logo + DTL/Face-on toggle, visible on every screen */}
      <NavBar />

      {/* Content */}
      <div className="flex-1 min-h-0">
        {view === 'home' && <HomeView />}
        {keepCameraMounted && (
          <div className={view === 'camera' ? 'h-full' : 'hidden'}>
            <CameraView />
          </div>
        )}
        {view === 'rules' && <RuleEditor />}
        {view === 'preview' && <FramePreview />}
        {view === 'analysis' && <AnalysisView />}
        {view === 'history' && <HistoryList />}
        {view === 'settings' && <SettingsView />}
      </div>

      {/* Bottom nav. The active tab is marked by a tinted capsule behind the icon
          rather than colour alone — on a bright range screen a hue shift on a 24px
          glyph is not a legible "you are here". */}
      <nav className="flex-shrink-0 flex items-stretch gap-0.5 px-2 pt-1.5 border-t border-line
                      bg-surface/90 backdrop-blur safe-bottom">
        {tabs.map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={`group flex-1 flex flex-col items-center gap-1 pt-1 pb-1.5 text-[10px]
                          font-semibold transition-colors duration-150 ${
                            active ? 'text-accent-text' : 'text-faint hover:text-fg-dim'
                          }`}
            >
              <span
                className={`flex items-center justify-center h-7 w-11 rounded-pill
                            transition-colors duration-200 ${active ? 'bg-accent-tint' : ''}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.1 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-[22px] h-[22px] transition-transform duration-150 group-active:scale-90"
                  aria-hidden
                >
                  <path d={icons[tab.key]} />
                </svg>
              </span>
              {t(tab.labelKey)}
            </button>
          );
        })}
      </nav>

      <Toast />

      <UpdateBanner />

      {!onboarded && <OnboardingWizard />}

      {DEV_PREVIEW && <DevLogPanel />}
    </div>
  );
}

export default App;
