import { AngleToggle } from './AngleToggle';
import { useOnboardingStore } from '../store/onboarding';

/** Persistent top bar shown on every screen: logo on the left, angle toggle on the right. */
export function NavBar() {
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  return (
    <header className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2.5
                       border-b border-slate-800 bg-slate-900 safe-top">
      <div className="flex items-center gap-1.5 select-none">
        {/* Dev-only: re-trigger the first-run onboarding wizard. */}
        {import.meta.env.DEV && (
          <button
            onClick={resetOnboarding}
            title="Starta onboarding (dev)"
            aria-label="Starta onboarding"
            className="text-slate-400 hover:text-emerald-400 transition-colors -ml-1 mr-0.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
              <path d="M5 21V9a7 7 0 0 1 14 0v12l-3-2-2 2-2-2-2 2-3-2z" />
              <path d="M9.5 10h.01M14.5 10h.01" />
            </svg>
          </button>
        )}
        <span className="text-emerald-400 text-lg leading-none">⛳</span>
        <span className="font-bold tracking-tight">SwingCheck</span>
      </div>
      <AngleToggle />
    </header>
  );
}
