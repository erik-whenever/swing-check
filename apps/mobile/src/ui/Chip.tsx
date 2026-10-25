import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { live } from './tokens';

export type ChipTone = 'neutral' | 'accent' | 'glass';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: ReactNode;
  tnum?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Chip (d1-v2 `.chip`): 28 pt pill. `glass` ligger ovanpå video. Statisk — tryckbara chips lindas i Pressable. */
export function Chip({ label, tone = 'neutral', icon, tnum, style }: ChipProps) {
  const { colors } = useTheme();
  const bg = tone === 'accent' ? colors.accentTint : tone === 'glass' ? live.glass : colors.raised;
  const fg = tone === 'accent' ? colors.accent : tone === 'glass' ? live.fg : colors.fgDim;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          minHeight: 28,
          paddingHorizontal: 11,
          borderRadius: 999,
          backgroundColor: bg,
        },
        // OSÄKER: skissens backdrop-filter blur saknas (kräver expo-blur). Risk låg — 50 % mörk ton läses ändå mot video.
        style,
      ]}
    >
      {icon}
      <Text variant="chip" color={fg} tnum={tnum} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
