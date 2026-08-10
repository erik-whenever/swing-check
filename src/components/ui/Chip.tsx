import type { ReactNode } from 'react';

export type ChipTone = 'accent' | 'neutral' | 'gold' | 'ok' | 'bad' | 'outline';

/** Small rounded tag: swing phase, camera angle, status. Never interactive. */
export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-[3px]
                  text-[9.5px] font-semibold leading-none whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const TONE: Record<ChipTone, string> = {
  accent: 'bg-accent-tint text-accent-text',
  neutral: 'bg-raised text-muted',
  gold: 'bg-gold-tint text-gold',
  ok: 'bg-ok-tint text-ok',
  bad: 'bg-bad-tint text-bad',
  outline: 'border border-line text-muted',
};

/**
 * The pass/fail/unknown marker used in every rule list. One glyph, one tint —
 * a verdict has to be readable in a phone glance from a tripod.
 */
export function VerdictDot({
  verdict,
  size = 'md',
}: {
  verdict: 'pass' | 'fail' | 'cannot_determine';
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[11px]';
  const tone =
    verdict === 'pass'
      ? 'bg-ok-tint text-ok'
      : verdict === 'fail'
        ? 'bg-bad-tint text-bad'
        : 'bg-raised text-faint';

  return (
    <span
      className={`flex-none rounded-full inline-flex items-center justify-center font-bold ${box} ${tone}`}
      aria-hidden
    >
      {verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : '?'}
    </span>
  );
}
