import { useId } from 'react';
import type { Language } from '../../lib/languages';

/**
 * Inline SVG flags so they render in color on every platform (Windows does not
 * render flag emoji). Add a case here when adding a language to AVAILABLE_LANGUAGES.
 */
export function FlagIcon({
  code,
  className = 'w-5 h-3.5',
}: {
  code: Language;
  className?: string;
}) {
  const id = useId();

  if (code === 'sv') {
    return (
      <svg viewBox="0 0 16 10" className={`${className} rounded-sm`} aria-hidden>
        <rect width="16" height="10" fill="#006AA7" />
        <rect x="5" width="2" height="10" fill="#FECC00" />
        <rect y="4" width="16" height="2" fill="#FECC00" />
      </svg>
    );
  }

  // United Kingdom (English)
  return (
    <svg viewBox="0 0 60 30" className={`${className} rounded-sm`} aria-hidden>
      <clipPath id={`${id}-frame`}>
        <rect width="60" height="30" />
      </clipPath>
      <clipPath id={`${id}-tri`}>
        <path d="M30,15 H60 V30 Z M30,15 V30 H0 Z M30,15 H0 V0 Z M30,15 V0 H60 Z" />
      </clipPath>
      <g clipPath={`url(#${id}-frame)`}>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${id}-tri)`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}
