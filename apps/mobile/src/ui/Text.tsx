import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type Theme } from './theme';
import { outfit, typeScale, type ColorToken, type TextVariant } from './tokens';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Token (t.ex. `'muted'`) eller rå färg. Standard: `fg` (eyebrow: `gold`). */
  color?: ColorToken | (string & {});
  /** Tabellsiffror för tal som uppdateras (poäng, procent, tider). */
  tnum?: boolean;
  /** Tvinga vikt inom varianten, t.ex. 600 för vald segmenttext. */
  weight?: 500 | 600 | 700;
}

export function textStyle(theme: Theme, variant: TextVariant, weightOverride?: 500 | 600 | 700): TextStyle {
  const t = typeScale[variant];
  const weight = weightOverride ?? t.weight;
  const useOutfit = t.family === 'outfit' && theme.fontsReady;
  return {
    // Egen familj per vikt för Outfit; fontWeight bara för systemfonten (Android bryter annars familjen).
    fontFamily: useOutfit ? outfit[weight as keyof typeof outfit] ?? outfit[600] : undefined,
    fontWeight: useOutfit ? undefined : (String(weight) as TextStyle['fontWeight']),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: 'letterSpacing' in t ? t.letterSpacing : undefined,
    textTransform: 'uppercase' in t && t.uppercase ? 'uppercase' : undefined,
  };
}

export function resolveColor(theme: Theme, color: string): string {
  return color in theme.colors ? theme.colors[color as ColorToken] : color;
}

/**
 * Text med d1-v2-varianter. Dynamic Type: RN skalar fontSize med systeminställningen
 * (allowFontScaling). Display-varianter kapas vid 1,6× så att rubriker inte spränger layouten.
 */
export function Text({ variant = 'body', color, tnum, weight, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const theme = useTheme();
  const isDisplay = variant === 'largeTitle' || variant === 'hello' || variant === 'title1';
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (isDisplay ? 1.6 : undefined)}
      style={[
        textStyle(theme, variant, weight),
        { color: resolveColor(theme, color ?? (variant === 'eyebrow' ? 'gold' : 'fg')) },
        tnum ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}
