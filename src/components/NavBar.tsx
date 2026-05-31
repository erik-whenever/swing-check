import { AngleToggle } from './AngleToggle';
import { useOnboardingStore } from '../store/onboarding';
import { useSessionStore } from '../store/session';

/** Persistent top bar shown on every screen: logo on the left, angle toggle on the right. */
export function NavBar() {
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <header className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2.5
                       border-b border-line bg-bg safe-top">
      <div className="flex items-center gap-1.5 select-none">
        {/* Dev-only: re-trigger the first-run onboarding wizard. */}
        {import.meta.env.DEV && (
          <button
            onClick={resetOnboarding}
            title="Starta onboarding (dev)"
            aria-label="Starta onboarding"
            className="text-muted hover:text-accent-text transition-colors -ml-1 mr-0.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
              <path d="M5 21V9a7 7 0 0 1 14 0v12l-3-2-2 2-2-2-2 2-3-2z" />
              <path d="M9.5 10h.01M14.5 10h.01" />
            </svg>
          </button>
        )}
        <span className="text-accent-text text-lg leading-none">⛳</span>
        <span className="font-bold tracking-tight">SwingCheck</span>
      </div>
      <div className="flex items-center gap-1.5">
        <AngleToggle />
        <button
          onClick={() => setView('settings')}
          aria-label="Inställningar"
          aria-current={view === 'settings' ? 'page' : undefined}
          className={`p-1.5 rounded-lg transition-colors ${
            view === 'settings'
              ? 'text-accent-text bg-raised'
              : 'text-muted hover:text-fg hover:bg-raised'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
               strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
