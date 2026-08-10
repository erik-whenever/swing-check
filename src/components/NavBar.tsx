import { AngleToggle } from './AngleToggle';
import { useOnboardingStore } from '../store/onboarding';
import { useSessionStore } from '../store/session';

/** Persistent top bar shown on every screen: wordmark on the left, angle toggle on the right. */
export function NavBar() {
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const view = useSessionStore((s) => s.view);
  const setView = useSessionStore((s) => s.setView);

  return (
    <header className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2.5
                       bg-bg safe-top">
      <button
        onClick={() => setView('home')}
        aria-label="SwingCheck — hem"
        className="flex items-center gap-2 select-none active:scale-[0.98] transition-transform"
      >
        {/* A drawn monogram, not an emoji: the mark has to survive being rendered by
            whatever emoji font the device happens to ship. */}
        <span className="w-[22px] h-[22px] rounded-full bg-accent text-on-accent
                         grid place-items-center text-[11px] font-semibold leading-none">
          S
        </span>
        <span className="font-semibold text-[15px] tracking-tight">SwingCheck</span>
      </button>

      <div className="flex items-center gap-1.5">
        {/* Dev-only: re-trigger the first-run onboarding wizard. */}
        {import.meta.env.DEV && (
          <button
            onClick={resetOnboarding}
            title="Starta onboarding (dev)"
            aria-label="Starta onboarding"
            className="text-faint hover:text-accent-text transition-colors p-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                 strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
              <path d="M5 21V9a7 7 0 0 1 14 0v12l-3-2-2 2-2-2-2 2-3-2z" />
              <path d="M9.5 10h.01M14.5 10h.01" />
            </svg>
          </button>
        )}
        <AngleToggle />
        <button
          onClick={() => setView('settings')}
          aria-label="Inställningar"
          aria-current={view === 'settings' ? 'page' : undefined}
          className={`p-1.5 rounded-pill transition-colors ${
            view === 'settings'
              ? 'text-accent-text bg-accent-tint'
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
