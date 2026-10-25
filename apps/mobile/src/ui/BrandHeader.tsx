import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

export interface BrandHeaderProps {
  /** Hälsningsrubrik, t.ex. "God eftermiddag.\nRedo för dagens ". Utelämnad = bara varumärkesraden. */
  greeting?: string;
  /** Ordet i accentgrönt som avslutar rubriken, t.ex. "svingar?". */
  highlight?: string;
  /** Höger sida av varumärkesraden (t.ex. rund ikonknapp). */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Hälsning efter tid på dygnet, som webbappen. */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'God natt.';
  if (h < 10) return 'God morgon.';
  if (h < 12) return 'God förmiddag.';
  if (h < 18) return 'God eftermiddag.';
  return 'God kväll.';
}

/** Varumärkesrad + hälsningsrubrik med grönt ord (d1-v2 `.brandbar` + `.hello`). */
export function BrandHeader({ greeting, highlight, trailing, style }: BrandHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <View accessible accessibilityRole="header" accessibilityLabel="SwingCheck" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="brand" color="onAccent" style={{ fontSize: 15, lineHeight: 18 }} allowFontScaling={false}>
              S
            </Text>
          </View>
          <Text variant="brand" maxFontSizeMultiplier={1.3}>
            SwingCheck
          </Text>
        </View>
        {trailing}
      </View>
      {greeting || highlight ? (
        <Text variant="hello" accessibilityRole="header" style={{ paddingTop: 10, paddingHorizontal: 4 }}>
          {greeting}
          {highlight ? <Text variant="hello" color="accent">{highlight}</Text> : null}
        </Text>
      ) : null}
    </View>
  );
}
