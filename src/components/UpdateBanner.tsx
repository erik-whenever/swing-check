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
      <div className="pointer-events-auto mt-2 flex items-center gap-3 px-4 py-2.5 bg-surface border border-line
                      rounded-lg shadow-lg text-sm w-full max-w-[406px] animate-[fadeIn_0.15s_ease-out]">
        <span className="flex-1 font-medium">Ny version tillgänglig 🔄</span>
        <button
          onClick={() => void updateServiceWorker(true)}
          className="px-3 py-1.5 rounded-md bg-accent-press text-white font-semibold whitespace-nowrap
                     transition-transform active:scale-95"
        >
          Uppdatera nu
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Stäng"
          className="text-faint hover:text-fg-dim transition-colors text-lg leading-none px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
