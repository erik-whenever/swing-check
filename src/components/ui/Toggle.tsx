/** Track/thumb switch. Green when on, line-coloured when off. */
export function Toggle({
  on,
  onClick,
  label,
  size = 'md',
}: {
  on: boolean;
  onClick: () => void;
  /** Accessible name when the switch has no adjacent visible label. */
  label?: string;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'w-8 h-[19px]' : 'w-11 h-6';
  const thumb = size === 'sm' ? 'w-[15px] h-[15px]' : 'w-5 h-5';
  const shift = size === 'sm' ? 'translate-x-[13px]' : 'translate-x-5';

  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative flex-none rounded-pill transition-colors duration-200 ${track} ${
        on ? 'bg-accent' : 'bg-line'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 rounded-full bg-surface shadow-seg
                    transition-transform duration-200 ${thumb} ${on ? shift : ''}`}
      />
    </button>
  );
}
