import { useEffect } from 'react';
import { useToastStore } from '../store/toast';

export function Toast() {
  const message = useToastStore((s) => s.message);
  const clear = useToastStore((s) => s.clear);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2200);
    return () => clearTimeout(t);
  }, [message, clear]);

  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 rounded-pill bg-accent px-4 py-2.5
                      text-xs font-semibold text-on-accent shadow-lift
                      animate-[fadeIn_0.2s_cubic-bezier(0.22,1,0.36,1)]">
        <span aria-hidden>✓</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
