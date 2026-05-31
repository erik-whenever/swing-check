import { COUNTDOWN_MAX, COUNTDOWN_MIN } from '../../store/settings';

interface CountdownStepperProps {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}

/**
 * Compact vertical control for the pre-record countdown. Scroll up (or tap ▲) to add
 * a second, scroll down (or tap ▼) to remove one. Sits next to the record button.
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
      className={`flex flex-col items-center select-none rounded-xl bg-surface px-2 py-1.5
                  ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
      aria-label="Countdown duration in seconds"
    >
      <button
        onClick={inc}
        disabled={disabled || value >= COUNTDOWN_MAX}
        aria-label="Increase countdown"
        className="text-muted hover:text-fg disabled:opacity-30 leading-none text-lg"
      >
        ▲
      </button>
      <div className="flex items-baseline gap-0.5 my-0.5">
        <span className="text-xl font-bold tabular-nums text-fg w-6 text-center">{value}</span>
        <span className="text-[10px] text-muted">s</span>
      </div>
      <button
        onClick={dec}
        disabled={disabled || value <= COUNTDOWN_MIN}
        aria-label="Decrease countdown"
        className="text-muted hover:text-fg disabled:opacity-30 leading-none text-lg"
      >
        ▼
      </button>
    </div>
  );
}
