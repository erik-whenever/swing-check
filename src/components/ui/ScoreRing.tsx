/**
 * Circular pass-rate gauge. Drawn with SVG rather than a conic-gradient so the
 * sweep can animate and the colour can come from a CSS variable — the gauge has
 * to track the theme, and a conic-gradient background can do neither.
 *
 * Colour is a verdict, not decoration: green ≥ 70 %, gold ≥ 40 %, clay below.
 */
export function ScoreRing({
  /** 0–1, or null when nothing assessable (renders an empty ring and a dash). */
  value,
  size = 36,
  label,
}: {
  value: number | null;
  size?: number;
  label?: string;
}) {
  const pct = value === null ? 0 : Math.round(value * 100);
  const stroke = size <= 28 ? 3 : 3.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const tone =
    value === null ? 'text-faint' : pct >= 70 ? 'text-ok' : pct >= 40 ? 'text-gold' : 'text-bad';

  return (
    <div
      className={`relative flex-none animate-sweep-in ${tone}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? (value === null ? 'Ingen data' : `${pct} procent`)}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke}
          className="stroke-line"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums"
        style={{ fontSize: size * 0.28 }}
        aria-hidden
      >
        {value === null ? '–' : pct}
      </span>
    </div>
  );
}
