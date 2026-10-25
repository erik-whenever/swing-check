/**
 * Designtokens för SwingCheck native, ur docs/design/d1-v2/index.html
 * (CSS-variablerna på rad ~16–80 med v2-överlagringen på rad ~361–368 tillämpad).
 * Ändra värden här, inte i komponenterna.
 */

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  raised: string;
  line: string;
  lineStrong: string;
  fg: string;
  fgDim: string;
  muted: string;
  faint: string;
  accent: string;
  accentTint: string;
  onAccent: string;
  pass: string;
  passTint: string;
  fail: string;
  failTint: string;
  unk: string;
  unkTint: string;
  gold: string;
  goldTint: string;
  /** Endast maskinseende (tracer, skelett, live-status). Aldrig knappar eller domar. */
  volt: string;
  chrome: string;
  segOn: string;
}

export type ColorToken = keyof Palette;

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F4F0E6',
    surface: '#FFFCF5',
    raised: '#ECE6D8',
    line: 'rgba(22, 33, 27, 0.11)', // v2
    lineStrong: 'rgba(22, 33, 27, 0.18)', // v2
    fg: '#15201A',
    fgDim: '#34413A',
    muted: '#69736C',
    faint: '#9BA39C',
    accent: '#1C6644',
    accentTint: '#DDEADF',
    onAccent: '#FFFFFF',
    pass: '#1E8350',
    passTint: '#DCEFE2',
    fail: '#C04E2C',
    failTint: '#F7E2D8',
    unk: '#7E847C',
    unkTint: '#E9E6DD',
    gold: '#9C7019', // v2
    goldTint: '#F3E8CF',
    volt: '#D6F03A',
    chrome: 'rgba(244, 240, 230, 0.82)',
    segOn: '#FFFCF5',
  },
  dark: {
    bg: '#0B110E',
    surface: '#141C18',
    raised: '#1D2722',
    line: 'rgba(240, 236, 226, 0.10)', // v2
    lineStrong: 'rgba(240, 236, 226, 0.15)',
    fg: '#F1EDE3',
    fgDim: '#D2CEC4',
    muted: '#98A29B',
    faint: '#66706A',
    accent: '#56C38A',
    accentTint: '#18352A',
    onAccent: '#08150F',
    pass: '#52C98A',
    passTint: '#173326',
    fail: '#F2845F',
    failTint: '#3A1E15',
    unk: '#A5AAA2',
    unkTint: '#262B27',
    gold: '#E3B95C',
    goldTint: '#352B16',
    volt: '#D9F23F',
    chrome: 'rgba(11, 17, 14, 0.82)',
    segOn: '#34413A',
  },
};

/** Fasta färger för livesessionen (alltid mörk, läses på 2–4 m), ur .s5 i d1-v2. */
export const live = {
  bg: '#050806',
  fg: '#FFFFFF',
  fgDim: 'rgba(255, 255, 255, 0.62)',
  passTint: 'rgba(82, 201, 138, 0.2)',
  pass: '#63D69A',
  failTint: 'rgba(242, 132, 95, 0.2)',
  fail: '#FF9572',
  unk: 'rgba(255, 255, 255, 0.35)',
  glass: 'rgba(10, 14, 12, 0.5)',
} as const;

/** Bas 4 pt. Namnen följer avstånden som återkommer i skisserna. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  /** Kort (v2: 20 pt; v1 hade 22). */
  card: 20,
  /** Inre rutor: tips, drill-rader, tidslinje. */
  inner: 14,
  /** Ikonrutor 40 pt. */
  icon: 12,
  pill: 999,
} as const;

/** Minsta träffyta (HIG). */
export const hitSlop = 44;

/**
 * Skuggor som CSS box-shadow-strängar — RN 0.76+ stöder `boxShadow` (nya arkitekturen),
 * så värdena kan tas ordagrant ur skissen.
 */
export const shadows: Record<ColorScheme, { card: string; segOn: string; primary: string }> = {
  light: {
    card: '0px 1px 1px rgba(22, 33, 27, 0.05), 0px 2px 6px -2px rgba(22, 33, 27, 0.08)',
    segOn: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    // color-mix(accent 80 %) ersatt med accent i rgba.
    primary: '0px 6px 14px -8px rgba(28, 102, 68, 0.8)',
  },
  dark: {
    card: '0px 1px 0px rgba(0, 0, 0, 0.35)',
    segOn: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    primary: '0px 6px 14px -8px rgba(86, 195, 138, 0.8)',
  },
};

/** Outfit-vikter som laddas (se fonts.ts). Nyckeln är fontFamily-namnet. */
export const outfit = {
  500: 'Outfit_500Medium',
  600: 'Outfit_600SemiBold',
  700: 'Outfit_700Bold',
} as const;

export type OutfitWeight = keyof typeof outfit;

export interface TypeStyle {
  /** 'outfit' = display/rubriker/knappar/chips (v2); 'system' = SF Pro (iOS-textstilar). */
  family: 'outfit' | 'system';
  weight: 400 | 500 | 600 | 700;
  size: number;
  lineHeight: number;
  /** I pt (CSS em × storlek). */
  letterSpacing?: number;
  uppercase?: boolean;
}

const em = (v: number, size: number) => Math.round(v * size * 100) / 100;

/**
 * Typskala. Systemstilarna följer iOS (Body 17, Callout 16, Subhead 15, Footnote 13,
 * Caption 12) utan egen spärrning — SF Pro sköter optisk spärrning själv.
 */
export const typeScale = {
  largeTitle: { family: 'outfit', weight: 700, size: 34, lineHeight: 40, letterSpacing: em(-0.035, 34) },
  hello: { family: 'outfit', weight: 700, size: 31, lineHeight: 35, letterSpacing: em(-0.035, 31) },
  title1: { family: 'outfit', weight: 600, size: 28, lineHeight: 34, letterSpacing: em(-0.02, 28) },
  title2: { family: 'outfit', weight: 700, size: 22, lineHeight: 27, letterSpacing: em(-0.025, 22) },
  headline: { family: 'outfit', weight: 600, size: 17, lineHeight: 22, letterSpacing: em(-0.012, 17) },
  button: { family: 'outfit', weight: 600, size: 17, lineHeight: 22, letterSpacing: em(-0.005, 17) },
  segment: { family: 'outfit', weight: 500, size: 15, lineHeight: 20 },
  chip: { family: 'outfit', weight: 600, size: 13, lineHeight: 16 },
  eyebrow: { family: 'outfit', weight: 700, size: 11.5, lineHeight: 16, letterSpacing: em(0.14, 11.5), uppercase: true },
  brand: { family: 'outfit', weight: 700, size: 18, lineHeight: 22, letterSpacing: em(-0.02, 18) },
  body: { family: 'system', weight: 400, size: 17, lineHeight: 22 },
  callout: { family: 'system', weight: 400, size: 16, lineHeight: 21 },
  subhead: { family: 'system', weight: 400, size: 15, lineHeight: 20 },
  footnote: { family: 'system', weight: 400, size: 13, lineHeight: 18 },
  caption: { family: 'system', weight: 500, size: 12, lineHeight: 16 },
} as const satisfies Record<string, TypeStyle>;

export type TextVariant = keyof typeof typeScale;
