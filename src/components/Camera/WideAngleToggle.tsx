import { useSettingsStore } from '../../store/settings';

/**
 * 0.5× | 1× segmented toggle, bound to the global wide-angle setting. Same shape
 * as `AngleToggle` — this is a framing control and belongs next to the angle.
 *
 * It stays enabled while recording on purpose: the value is picked up at the next
 * recording start (see `useCamera`), so a mid-session change is remembered rather
 * than blocked.
 */
export function WideAngleToggle() {
  const wideAngle = useSettingsStore((s) => s.wideAngle);
  const setWideAngle = useSettingsStore((s) => s.setWideAngle);

  return (
    <div
      role="group"
      aria-label="Vidvinkel"
      className="flex rounded-full overflow-hidden border border-line text-[11px] font-bold"
    >
      {([true, false] as const).map((wide) => (
        <button
          key={String(wide)}
          onClick={() => setWideAngle(wide)}
          aria-pressed={wideAngle === wide}
          className={`px-2.5 py-1 transition-colors ${
            wideAngle === wide
              ? 'bg-accent text-on-accent'
              : 'bg-bg/80 text-muted hover:bg-raised'
          }`}
        >
          {wide ? '0.5×' : '1×'}
        </button>
      ))}
    </div>
  );
}
