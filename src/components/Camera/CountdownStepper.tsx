import { COUNTDOWN_MAX, COUNTDOWN_MIN } from '../../store/settings';

interface CountdownStepperProps {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}

/**
 * Countdown length as a chip with −/+ ends, matching the other camera-mode chips.
 *
 * It used to be a vertical ▲/▼ column, which read as a spinner widget and sat at a
 * different visual altitude than every other setting on the same screen.
 */
export function CountdownStepper({ value, onChange, disabled }: CountdownStepperProps) {
  const clamp = (n: number) => Math.max(COUNTDOWN_MIN, Math.min(COUNTDOWN_MAX, n));
  const inc = () => onChange(clamp(value + 1));
  const dec = () => onChange(clamp(value - 1));

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    if (e.deltaY < 0) inc();
    else dec();
  };

  return (
    <div
      onWheel={handleWheel}
      className={`flex flex-none items-center select-none rounded-pill bg-raised px-1
                  text-[10.5px] font-semibold text-muted
                  ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
      aria-label="Nedräkning i sekunder"
    >
      <button
        onClick={dec}
        disabled={disabled || value <= COUNTDOWN_MIN}
        aria-label="Kortare nedräkning"
        className="w-6 h-7 rounded-pill text-sm leading-none hover:text-fg disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-[2.75rem] text-center tabular-nums text-fg">⏱ {value} s</span>
      <button
        onClick={inc}
        disabled={disabled || value >= COUNTDOWN_MAX}
        aria-label="Längre nedräkning"
        className="w-6 h-7 rounded-pill text-sm leading-none hover:text-fg disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
