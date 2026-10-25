import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  /** Ikon före texten (ärver ingen färg — skicka in i rätt färg, se `buttonForeground`). */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Förgrundsfärg per variant, för ikoner som skickas in. */
export function useButtonForeground(variant: ButtonVariant): string {
  const { colors } = useTheme();
  return variant === 'primary' ? colors.onAccent : variant === 'secondary' ? colors.fg : colors.accent;
}

/**
 * Pillerknapp (d1-v2 `.pill-btn`). Primär = accent, sekundär = tonal (yta + kant + skugga),
 * ghost = textlänk. Höjd 56 pt (ghost 44) — alltid ≥ 44 pt träffyta.
 */
export function Button({ title, variant = 'primary', icon, disabled, style, ...rest }: ButtonProps) {
  const { colors, shadows } = useTheme();
  const fg = useButtonForeground(variant);
  const surface: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: colors.accent, boxShadow: shadows.primary }
      : variant === 'secondary'
        ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, boxShadow: shadows.card }
        : {};
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: variant === 'ghost' ? 44 : 56,
          borderRadius: 999,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          // Alltid en array: RN skickar null till processTransform när transform går array → undefined (krasch vid släpp).
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        surface,
        style,
      ]}
      {...rest}
    >
      {icon ? <View>{icon}</View> : null}
      <Text variant="button" color={fg} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}
