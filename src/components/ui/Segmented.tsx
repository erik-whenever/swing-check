/**
 * Segmented control: a sunken track with the active option riding on a raised
 * cream pill. Used for every either/or in the app (tabs, angle, voice mode) so
 * a two-way choice always looks the same, whatever it switches.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  full,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Stretch each option to equal width (page-level tabs); off = hug content. */
  full?: boolean;
  ariaLabel?: string;
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-[7px] text-[11px]';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex rounded-pill bg-raised p-[3px] ${full ? 'w-full' : 'inline-flex'}`}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`rounded-pill font-semibold transition-all duration-200 whitespace-nowrap
                        ${pad} ${full ? 'flex-1' : ''} ${
                          active
                            ? 'bg-surface text-accent-text shadow-seg'
                            : 'text-muted hover:text-fg'
                        }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
