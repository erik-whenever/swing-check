import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows a prompt when a new service worker is waiting (registerType: 'prompt'), letting the
 * user update with one tap instead of manually reopening the app. Rendered as a fixed
 * overlay at the top so it never shifts the camera view's layout.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[env(safe-area-inset-top)] pointer-events-none">
      <div className="pointer-events-auto mt-2 flex w-full max-w-[406px] items-center gap-3
                      rounded-card border border-line bg-surface px-4 py-2.5 shadow-lift
                      animate-[fadeIn_0.2s_cubic-bezier(0.22,1,0.36,1)]">
        <span className="flex-1 text-xs font-semibold">Ny version tillgänglig</span>
        <button
          onClick={() => void updateServiceWorker(true)}
          className="whitespace-nowrap rounded-pill bg-accent px-3.5 py-1.5 text-[11px]
                     font-semibold text-on-accent transition-transform active:scale-95"
        >
          Uppdatera
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Stäng"
          className="px-1 text-lg leading-none text-faint transition-colors hover:text-fg-dim"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
