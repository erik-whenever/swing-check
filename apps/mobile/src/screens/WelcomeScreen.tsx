import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Text, ThemeProvider, useTheme, palettes } from '../ui';

/**
 * Välkommen (d1-v2 skärm 0, `png/valkommen.png`). Ren presentationskomponent:
 * all text, sidindex och callbacks kommer in via props.
 *
 * Varumärkessplash: alltid i ljust schema (grön accentbotten, vit text, krämvit knapp) oavsett
 * systemets läge — skissen har bara en variant, och den mörka accenten (#56C38A) bär inte vit text.
 */
export interface WelcomeScreenProps {
  /** 0-baserat index för aktuell introsida. */
  step: number;
  /** Antal introsidor (prickraden). Skissen: 4. */
  stepCount: number;
  /** Liten guldetikett över rubriken, t.ex. "4 snabba steg". */
  eyebrow?: string;
  /** Rubrik före det framhävda ordet, t.ex. "Se din sving som ". */
  titleLead: string;
  /** Framhävt ord i volt, t.ex. "coachen". */
  titleHighlight?: string;
  /** Rubrik efter det framhävda ordet, t.ex. " ser den.". */
  titleTail?: string;
  body: string;
  /** Illustration i cirkeln (sving + tracer). Utelämnad = tom cirkel. */
  illustration?: ReactNode;
  ctaLabel: string;
  onNext: () => void;
  /** Utelämnad = ingen "Hoppa över". */
  onSkip?: () => void;
  skipLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function WelcomeScreen(props: WelcomeScreenProps) {
  return (
    <ThemeProvider scheme="light">
      <WelcomeBody {...props} />
    </ThemeProvider>
  );
}

function WelcomeBody({
  step,
  stepCount,
  eyebrow,
  titleLead,
  titleHighlight,
  titleTail,
  body,
  illustration,
  ctaLabel,
  onNext,
  onSkip,
  skipLabel = 'Hoppa över',
  style,
}: WelcomeScreenProps) {
  const { colors, space } = useTheme();
  const onBrand = colors.onAccent;
  const dim = 'rgba(255, 255, 255, 0.72)';
  return (
    <View style={[{ flex: 1, backgroundColor: colors.accent }, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.xxl,
          minHeight: 44,
        }}
      >
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Steg ${step + 1} av ${stepCount}`}
          style={{ flexDirection: 'row', gap: 6 }}
        >
          {Array.from({ length: stepCount }, (_, i) => (
            <View
              key={i}
              style={{
                height: 4,
                width: i === step ? 30 : 20,
                borderRadius: 2,
                backgroundColor: i === step ? onBrand : 'rgba(255, 255, 255, 0.3)',
              }}
            />
          ))}
        </View>
        {onSkip ? (
          <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="headline" color={dim}>
              {skipLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.xxl, paddingBottom: space.lg }}>
        <View style={{ alignItems: 'center', paddingTop: space.xxl }}>
          <View
            style={{
              width: '92%',
              maxWidth: 300,
              aspectRatio: 1,
              borderRadius: 999,
              padding: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: 999,
                overflow: 'hidden',
                backgroundColor: 'rgba(255, 255, 255, 0.10)',
              }}
            >
              {illustration}
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'center', paddingTop: space.xxxl, gap: space.lg }}>
          {eyebrow ? (
            <View style={{ paddingHorizontal: 12, minHeight: 24, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}>
              {/* Guld ur mörkt schema: den ljusa guldtonen läses mot grönt. */}
              <Text variant="eyebrow" color={palettes.dark.gold}>
                {eyebrow}
              </Text>
            </View>
          ) : null}
          <Text variant="largeTitle" color={onBrand} accessibilityRole="header" style={{ textAlign: 'center' }}>
            {titleLead}
            {titleHighlight ? (
              <Text variant="largeTitle" color={colors.volt}>
                {titleHighlight}
              </Text>
            ) : null}
            {titleTail}
          </Text>
          <Text variant="body" color={dim} style={{ textAlign: 'center' }}>
            {body}
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space.xxl, paddingBottom: space.xxl }}>
        {/* Sekundär variant = krämvit pill med mörk text, som skissen. */}
        <Button title={ctaLabel} variant="secondary" onPress={onNext} style={{ borderWidth: 0 }} />
      </View>
    </View>
  );
}
