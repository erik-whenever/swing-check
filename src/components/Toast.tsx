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
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-accent-press text-white
                      rounded-lg shadow-lg text-sm font-medium animate-[fadeIn_0.15s_ease-out]">
        <span>✓</span>
        <span>{message}</span>
      </div>
    </div>
  );
}
