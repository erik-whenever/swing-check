import { useEffect } from 'react';
import { useSessionStore } from './store/session';
import { useSettingsStore } from './store/settings';
import { detectLanguageByGeo } from './lib/geo';
import { HomeView } from './components/Home/HomeView';
import { CameraView } from './components/Camera/CameraView';
import { RuleEditor } from './components/Rules/RuleEditor';
import { AnalysisView } from './components/Analysis/AnalysisView';
import { HistoryList } from './components/History/HistoryList';
import { FramePreview } from './components/Analysis/FramePreview';
import { Toast } from './components/Toast';
import { NavBar } from './components/NavBar';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import { useOnboardingStore } from './store/onboarding';
import { useT } from './lib/i18n';

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
  const onboarded = useOnboardingStore((s) => s.completed);

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
    <div className="flex flex-col h-full max-w-[430px] mx-auto bg-slate-900">
      {/* Persistent top nav: logo + DTL/Face-on toggle, visible on every screen */}
      <NavBar />

      {/* Content */}
      <div className="flex-1 min-h-0">
        {view === 'home' && <HomeView />}
        {view === 'camera' && <CameraView />}
        {view === 'rules' && <RuleEditor />}
        {view === 'preview' && <FramePreview />}
        {view === 'analysis' && <AnalysisView />}
        {view === 'history' && <HistoryList />}
      </div>

      {/* Bottom nav */}
      <nav className="flex-shrink-0 flex border-t border-slate-800 bg-slate-900 safe-bottom">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              view === tab.key
                ? 'text-emerald-400 border-t-2 border-emerald-400 -mt-px'
                : 'text-slate-500'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      <Toast />

      {!onboarded && <OnboardingWizard />}
    </div>
  );
}

export default App;
