/**
 * Hand-built SVG illustrations for the onboarding wizard.
 *
 * The wizard is a full-bleed fairway-green screen, so these are drawn in cream and
 * gold rather than in accent green — an emerald figure on a green ground is a
 * figure you cannot see. Cream carries the subject, gold carries the one thing each
 * step is pointing at. Decorative only; the host wraps them in aria-hidden.
 */

const INK = '#f5f1e8'; // cream — the subject
const DIM = 'rgba(245,241,232,0.45)'; // secondary structure
const FAINT = 'rgba(245,241,232,0.22)'; // ground lines, frames
const GOLD = '#e0bd76'; // the highlight of the step

/** Step 1 — a stylised golfer mid-swing with a flag, the brand hero. */
export function WelcomeArt() {
  return (
    <svg viewBox="0 0 240 200" fill="none" className="w-full h-full">
      <defs>
        <radialGradient id="w-glow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={INK} stopOpacity="0.16" />
          <stop offset="100%" stopColor={INK} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="90" r="90" fill="url(#w-glow)" />
      {/* swing arc */}
      <path
        d="M62 150 A72 72 0 0 1 196 96"
        stroke={GOLD}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 9"
        opacity="0.8"
      />
      {/* flag */}
      <line x1="186" y1="44" x2="186" y2="150" stroke={DIM} strokeWidth="3" strokeLinecap="round" />
      <path d="M186 46 L214 54 L186 64 Z" fill={GOLD} />
      {/* golfer */}
      <g stroke={INK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="92" cy="64" r="11" fill={INK} stroke="none" />
        <path d="M92 76 L96 116" />
        <path d="M96 116 L80 152 M96 116 L112 152" />
        <path d="M93 88 L128 70" />
        <path d="M93 92 L70 74" />
      </g>
      {/* club */}
      <path d="M128 70 L150 40" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
      <path d="M150 40 l8 4" stroke={GOLD} strokeWidth="7" strokeLinecap="round" />
      {/* ground */}
      <path d="M40 158 H200" stroke={FAINT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Step 2 — a top-down map showing DTL (behind) and face-on camera spots. */
export function AngleArt() {
  return (
    <svg viewBox="0 0 240 200" fill="none" className="w-full h-full">
      <defs>
        <radialGradient id="a-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={INK} stopOpacity="0.12" />
          <stop offset="100%" stopColor={INK} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="100" r="92" fill="url(#a-glow)" />
      {/* target line */}
      <path d="M120 168 V40" stroke={DIM} strokeWidth="2" strokeDasharray="4 6" />
      <path d="M120 40 l-6 10 M120 40 l6 10" stroke={DIM} strokeWidth="2" strokeLinecap="round" />
      {/* ball + player (top-down) */}
      <circle cx="120" cy="120" r="5" fill={INK} />
      <circle cx="104" cy="120" r="9" fill="none" stroke={DIM} strokeWidth="3" />
      {/* DTL camera (behind, along the line) — cream */}
      <g>
        <rect x="108" y="172" width="24" height="17" rx="3" fill={INK} />
        <circle cx="120" cy="180.5" r="4" fill="#1d5c3d" />
        <path d="M120 172 V150" stroke={INK} strokeWidth="2" strokeDasharray="3 4" opacity="0.7" />
        <text x="120" y="199" fill={INK} fontSize="11" fontWeight="700" textAnchor="middle">DTL</text>
      </g>
      {/* Face-on camera (in front, to the side) — gold, so the two never blur together */}
      <g>
        <rect x="36" y="111" width="24" height="17" rx="3" fill={GOLD} />
        <circle cx="48" cy="119.5" r="4" fill="#1d5c3d" />
        <path d="M60 119 H94" stroke={GOLD} strokeWidth="2" strokeDasharray="3 4" opacity="0.8" />
        <text x="48" y="104" fill={GOLD} fontSize="11" fontWeight="700" textAnchor="middle">Face-on</text>
      </g>
    </svg>
  );
}

/** Step 3 — phone on a tripod at hip height, framing a full body. */
export function CameraArt() {
  return (
    <svg viewBox="0 0 240 200" fill="none" className="w-full h-full">
      <defs>
        <radialGradient id="c-glow" cx="32%" cy="45%" r="55%">
          <stop offset="0%" stopColor={INK} stopOpacity="0.14" />
          <stop offset="100%" stopColor={INK} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="95" r="92" fill="url(#c-glow)" />
      {/* tripod */}
      <g stroke={DIM} strokeWidth="4" strokeLinecap="round">
        <path d="M64 96 L48 170 M64 96 L80 170 M64 96 L64 150" />
      </g>
      {/* phone */}
      <g>
        <rect x="48" y="64" width="34" height="56" rx="6" fill="#14472e" stroke={INK} strokeWidth="3" />
        <rect x="53" y="72" width="24" height="40" rx="3" fill="#103a26" />
        {/* tiny framed golfer on the screen */}
        <g stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" fill="none">
          <circle cx="65" cy="82" r="3" fill={GOLD} stroke="none" />
          <path d="M65 86 V98 M65 98 L60 108 M65 98 L70 108 M65 90 L72 92" />
        </g>
      </g>
      {/* hip-height marker */}
      <path d="M96 92 H150" stroke={GOLD} strokeWidth="2" strokeDasharray="4 4" />
      <text x="123" y="86" fill={GOLD} fontSize="10" fontWeight="600" textAnchor="middle">~höft</text>
      {/* full golfer being framed */}
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <circle cx="178" cy="58" r="9" fill={INK} stroke="none" />
        <path d="M178 68 V118 M178 118 L166 160 M178 118 L190 160 M178 84 L200 74 M178 84 L158 96" />
      </g>
      {/* framing brackets */}
      <g stroke={DIM} strokeWidth="2.5" strokeLinecap="round">
        <path d="M150 40 h-10 v10 M206 40 h10 v10 M150 172 h-10 v-10 M206 172 h10 v-10" />
      </g>
      <path d="M30 172 H214" stroke={FAINT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Step 4 — a checklist of rules, some toggled on. */
export function RulesArt() {
  const rows = [
    { y: 50, on: true, w: 92 },
    { y: 86, on: true, w: 110 },
    { y: 122, on: false, w: 78 },
    { y: 158, on: true, w: 100 },
  ];
  return (
    <svg viewBox="0 0 240 200" fill="none" className="w-full h-full">
      {rows.map((r, i) => (
        <g key={i}>
          <rect
            x="40" y={r.y - 16} width="160" height="32" rx="12"
            fill="rgba(245,241,232,0.08)" stroke={FAINT} strokeWidth="1.5"
          />
          <rect
            x="50" y={r.y - 9} width="18" height="18" rx="6"
            fill={r.on ? GOLD : 'none'}
            stroke={r.on ? GOLD : DIM}
            strokeWidth="2"
          />
          {r.on && (
            <path
              d={`M54 ${r.y} l3.5 3.5 L64 ${r.y - 4}`}
              stroke="#1d5c3d"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
          <rect x="80" y={r.y - 3.5} width={r.w} height="7" rx="3.5" fill={r.on ? INK : DIM} />
        </g>
      ))}
    </svg>
  );
}

/** Step 5 — the record button radiating sound waves. */
export function RecordArt() {
  return (
    <svg viewBox="0 0 240 200" fill="none" className="w-full h-full">
      <defs>
        <radialGradient id="rec-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.22" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="100" r="92" fill="url(#rec-glow)" />
      {/* record button — the app's shape: a ring with a solid core */}
      <circle cx="120" cy="100" r="40" fill="none" stroke={INK} strokeWidth="4" />
      <circle cx="120" cy="100" r="26" fill={GOLD} />
      {/* sound waves */}
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M176 78 a30 30 0 0 1 0 44" />
        <path d="M190 66 a52 52 0 0 1 0 68" />
      </g>
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M64 78 a30 30 0 0 0 0 44" />
        <path d="M50 66 a52 52 0 0 0 0 68" />
      </g>
    </svg>
  );
}
