import type { ReactNode } from 'react';

/**
 * The one card shape in the app: cream surface, hairline border, 18px radius.
 *
 * Every screen used to invent its own `p-3 rounded-lg bg-surface border`, which
 * is why radii and padding drifted between views. Anything card-shaped goes
 * through here so the drift can't come back.
 */
export function Card({
  children,
  className = '',
  tone = 'default',
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** `focus` = gold hairline (the focus rule), `muted` = an inactive/off item. */
  tone?: 'default' | 'focus' | 'muted';
  /** Off when the card owns its own row padding (list cards with dividers). */
  padded?: boolean;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const toneClass =
    tone === 'focus'
      ? 'border-gold/70'
      : tone === 'muted'
        ? 'border-line opacity-60'
        : 'border-line';

  return (
    <Tag
      className={`bg-surface border rounded-card shadow-card ${toneClass} ${
        padded ? 'p-3.5' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Uppercase group label above a card ("UPPSTÄLLNING", "UTSEENDE"). */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`eyebrow text-muted px-1 mb-2 ${className}`}>{children}</p>
  );
}
