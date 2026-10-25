import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

export interface ConfidenceBarProps {
  /** 0–1. Värden utanför kläms. */
  value: number;
  /** Visa procenttext före stapeln (standard true). */
  showLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Konfidens (d1-v2 `.conf`): "84 %" + 28×4 pt stapel. Neutral färg — konfidens är inte en dom. */
export function ConfidenceBar({ value, showLabel = true, style }: ConfidenceBarProps) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(v * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Säkerhet"
      accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct} procent` }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}
    >
      {showLabel ? (
        <Text variant="caption" color="muted" tnum>
          {`${pct} %`}
        </Text>
      ) : null}
      <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 2, backgroundColor: colors.fgDim }} />
      </View>
    </View>
  );
}
