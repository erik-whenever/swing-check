import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';

export interface SectionLabelProps {
  children: string;
  /** Höger sida av rubrikraden, t.ex. en länk eller räknare. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Guldrubrik i versaler (d1-v2 `.eyebrow` + `.sec-h`): HELHETSBEDÖMNING, FOKUS, GÖR SÅ HÄR. */
export function SectionLabel({ children, trailing, style }: SectionLabelProps) {
  return (
    <View
      accessibilityRole="header"
      style={[
        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 22, paddingBottom: 8, paddingHorizontal: 4 },
        style,
      ]}
    >
      <Text variant="eyebrow">{children}</Text>
      {trailing}
    </View>
  );
}
