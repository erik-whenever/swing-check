/**
 * Trend line for a series of 0–1 scores. Deliberately axis-less: it answers
 * "which way is this going", not "what was swing 7" — the list below answers that.
 */
export function Sparkline({
  points,
  width = 92,
  height = 28,
  className = '',
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const pad = 2;
  const step = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (1 - Math.min(1, Math.max(0, v))) * (height - pad * 2);
  const coords = points.map((p, i) => `${pad + i * step},${y(p)}`).join(' ');
  const area = `${pad},${height} ${coords} ${width - pad},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`text-accent ${className}`}
      aria-hidden
    >
      <polygon points={area} fill="currentColor" opacity={0.1} />
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width - pad} cy={y(points[points.length - 1])} r={2.5} fill="currentColor" />
    </svg>
  );
}

/**
 * Per-swing verdict histogram: one bar per swing, full height = pass.
 * Height carries the verdict as well as colour, so it survives a glance and
 * colour-blindness alike.
 */
export function VerdictBars({
  verdicts,
  className = '',
}: {
  verdicts: ('pass' | 'fail' | 'cannot_determine')[];
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-[2px] h-[30px] ${className}`} aria-hidden>
      {verdicts.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[2px] ${
            v === 'pass'
              ? 'bg-chart-good'
              : v === 'fail'
                ? 'bg-chart-bad'
                : 'bg-line'
          }`}
          style={{ height: v === 'pass' ? '100%' : v === 'fail' ? '42%' : '20%' }}
          title={v}
        />
      ))}
    </div>
  );
}
