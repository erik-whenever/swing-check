import { View, type ViewProps } from 'react-native';

import { useTheme } from './theme';

export interface CardProps extends ViewProps {
  /** Inre luft. Standard 16 (rader med egen padding: sätt 0). */
  padding?: number;
  /** Guldmarkerat fokuskort (FOKUS i resultatet). */
  focus?: boolean;
}

/** Vitt kort med tunn kant och lätt skugga (d1-v2 `.card`, radie 20, kontinuerliga hörn). */
export function Card({ padding = 16, focus, style, ...rest }: CardProps) {
  const { colors, shadows, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.line,
          boxShadow: shadows.card,
          padding,
        },
        focus
          ? {
              borderColor: colors.gold,
              // OSÄKER: skissens färgblandning (gold 55 %) ersatt med hel guldkant + guldton-ring. Risk låg, visuell.
              boxShadow: `0px 0px 0px 3px ${colors.goldTint}, ${shadows.card}`,
            }
          : null,
        style,
      ]}
      {...rest}
    />
  );
}
