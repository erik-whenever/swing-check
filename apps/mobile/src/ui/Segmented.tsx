import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Piller-segment (d1-v2 `.seg`): rundad bricka, vald del lyft med `segOn`. Segment ≥ 44 pt träffyta. */
export function Segmented<T extends string>({ options, value, onChange, style, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, shadows } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.raised }, style]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => !on && onChange(o.value)}
            // Visuellt 36 pt som skissen; hitSlop ger 44 pt träffyta.
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              { flex: 1, minHeight: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
              on ? { backgroundColor: colors.segOn, boxShadow: shadows.segOn } : null,
            ]}
          >
            <Text variant="segment" weight={on ? 600 : undefined} color={on ? 'fg' : 'fgDim'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
