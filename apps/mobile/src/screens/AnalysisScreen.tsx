import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RulePhase } from '@swingcheck/core/lib/recommendRules';

import { Card, Chip, Text, useTheme } from '../ui';

/** De fyra arbetsstegen, i ordning. */
export type AnalysisStepId = 'swing' | 'frames' | 'rules' | 'shaft';
export type AnalysisStepStatus = 'pending' | 'active' | 'done';

export interface AnalysisStepState {
  status: AnalysisStepStatus;
  /** Högerställd detalj, t.ex. "2,4–4,1 s", "6 st", "3 / 5". */
  detail?: string;
}

export interface AnalysisScreenProps {
  /** Status per steg. Saknat steg = väntar. */
  steps: Partial<Record<AnalysisStepId, AnalysisStepState>>;
  /** Nyckelbild per fas. Saknad = platshållare. */
  frames: Partial<Record<RulePhase, ImageSourcePropType>>;
  /** Fasen som visas stort och markeras i raden. */
  activePhase: RulePhase;
  /** Tryck på en tumnagel. Utelämnad = tumnaglarna är inte tryckbara. */
  onSelectPhase?: (phase: RulePhase) => void;
  /** Lager ovanpå den stora bilden (t.ex. skelett, SkeletonOverlay). */
  overlay?: ReactNode;
  /** Antal regler som bedöms (rubriken "Bedömer 5 regler"). */
  ruleCount: number;
  /** Uppskattad återstående tid i sekunder. `null` = okänd (raden döljs). */
  remainingSeconds: number | null;
  /** Total framdrift 0–1. */
  progress: number;
  onCancel: () => void;
  style?: StyleProp<ViewStyle>;
}

const STEP_ORDER: readonly AnalysisStepId[] = ['swing', 'frames', 'rules', 'shaft'];

/** Etikett per steg: [pågår/väntar, klart]. */
const STEP_LABEL: Record<AnalysisStepId, [string, string]> = {
  swing: ['Letar efter svingen', 'Svingen hittad'],
  frames: ['Väljer nyckelbilder', 'Nyckelbilder valda'],
  rules: ['Bedömer reglerna', 'Reglerna bedömda'],
  shaft: ['Ritar skaftets bana', 'Skaftets bana ritad'],
};

export const PHASE_ORDER: readonly RulePhase[] = ['address', 'backswing', 'top', 'downswing', 'impact', 'follow'];

/** Korta fasnamn (tumnagelrad). */
export const PHASE_SHORT: Record<RulePhase, string> = {
  address: 'Uppställn.',
  backswing: 'Baksving',
  top: 'Topp',
  downswing: 'Nedsving',
  impact: 'Träff',
  follow: 'Avslut',
};

const PHASE_FULL: Record<RulePhase, string> = { ...PHASE_SHORT, address: 'Uppställning' };

/**
 * Analys pågår (d1-v2 `png/analys-{light,dark}.png`, d1/README "Skärm för skärm").
 * Ren presentationskomponent: inga state-hooks, ingen navigation, inga nätanrop.
 */
export function AnalysisScreen({
  steps,
  frames,
  activePhase,
  onSelectPhase,
  overlay,
  ruleCount,
  remainingSeconds,
  progress,
  onCancel,
  style,
}: AnalysisScreenProps) {
  const { colors, space, radius } = useTheme();
  const activeIndex = PHASE_ORDER.indexOf(activePhase);
  const hero = frames[activePhase];
  const pct = Math.min(1, Math.max(0, progress));

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {/* Navigeringsrad: Avbryt + centrerad titel. */}
      <View style={{ height: 44, justifyContent: 'center', paddingHorizontal: space.lg }}>
        <Text variant="headline" accessibilityRole="header" style={{ textAlign: 'center' }}>
          Analyserar
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          hitSlop={10}
          style={{ position: 'absolute', left: space.lg, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <Text variant="body" color="accent">
            Avbryt
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}>
        <View
          style={{
            marginTop: space.md,
            aspectRatio: 820 / 595,
            borderRadius: radius.card,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          {hero ? (
            <Image source={hero} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
          ) : (
            <FramePlaceholder size={56} />
          )}
          {overlay ? <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>{overlay}</View> : null}
          <View style={{ padding: space.md }}>
            <Chip label={`Bild ${activeIndex + 1} av ${PHASE_ORDER.length} · ${PHASE_FULL[activePhase]}`} tone="glass" tnum />
          </View>
        </View>

        <Text variant="title1" weight={700} accessibilityRole="header" style={{ marginTop: space.xxl, paddingHorizontal: 4 }}>
          {`Bedömer ${ruleCount} ${ruleCount === 1 ? 'regel' : 'regler'}`}
        </Text>
        {remainingSeconds != null ? (
          <Text variant="callout" color="muted" style={{ marginTop: space.xs, paddingHorizontal: 4 }}>
            {remainingSeconds <= 1 ? 'Nästan klart' : `Ungefär ${Math.round(remainingSeconds)} sekunder kvar`}
          </Text>
        ) : null}

        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
          style={{ height: 6, borderRadius: 3, backgroundColor: colors.raised, marginTop: space.lg, marginHorizontal: 4, overflow: 'hidden' }}
        >
          {/* OSÄKER: skissens gradient (accent→pass) ersatt med hel accent; ingen gradient-komponent i src/ui. Risk låg, visuell. */}
          <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 3, backgroundColor: colors.accent }} />
        </View>

        {/* Sex nyckelbilder per fas. */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: space.lg }}>
          {PHASE_ORDER.map((phase) => {
            const on = phase === activePhase;
            const src = frames[phase];
            const thumb = (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: '100%',
                    aspectRatio: 0.78,
                    borderRadius: radius.inner,
                    borderCurve: 'continuous',
                    overflow: 'hidden',
                    backgroundColor: colors.raised,
                    borderWidth: on ? 2.5 : 0,
                    borderColor: colors.accent,
                  }}
                >
                  {src ? (
                    <Image source={src} resizeMode="cover" style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
                  ) : (
                    <FramePlaceholder size={18} />
                  )}
                </View>
                <Text variant="caption" weight={on ? 600 : undefined} color={on ? 'accent' : 'muted'} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {PHASE_SHORT[phase]}
                </Text>
              </View>
            );
            return onSelectPhase ? (
              <Pressable
                key={phase}
                accessibilityRole="button"
                accessibilityLabel={PHASE_FULL[phase]}
                accessibilityState={{ selected: on }}
                onPress={() => onSelectPhase(phase)}
                style={{ flex: 1 }}
              >
                {thumb}
              </Pressable>
            ) : (
              <View key={phase} accessible accessibilityLabel={PHASE_FULL[phase]} style={{ flex: 1 }}>
                {thumb}
              </View>
            );
          })}
        </View>

        <Card padding={0} style={{ marginTop: space.xl, paddingHorizontal: space.lg }}>
          {STEP_ORDER.map((id, i) => {
            const st = steps[id] ?? { status: 'pending' as const };
            const label = STEP_LABEL[id][st.status === 'done' ? 1 : 0];
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={`${label}${st.detail ? `, ${st.detail}` : ''}${st.status === 'active' ? ', pågår' : st.status === 'pending' ? ', väntar' : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  minHeight: 52,
                  paddingVertical: space.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.line,
                }}
              >
                <StepIcon status={st.status} />
                <Text variant="body" color={st.status === 'pending' ? 'faint' : 'fg'} style={{ flex: 1 }} numberOfLines={1}>
                  {label}
                </Text>
                {st.detail ? (
                  <Text variant="callout" color="muted" tnum>
                    {st.detail}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </Card>

        <Text variant="footnote" color="muted" style={{ textAlign: 'center', marginTop: space.lg }}>
          Du kan lämna appen. Vi säger till när det är klart.
        </Text>
      </ScrollView>
    </View>
  );
}

function StepIcon({ status }: { status: AnalysisStepStatus }) {
  const { colors } = useTheme();
  const size = 24;
  if (status === 'done') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={12} fill={colors.accent} />
        <Path d="M7.5 12.3l3 3 6-6.3" stroke={colors.onAccent} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (status === 'active') {
    // OSÄKER: bågen står still — rotation kräver Animated/Reanimated-state, vilket presentationslagret inte äger.
    // Risk låg: framdriften syns ändå i stapeln och detaljen ("3 / 5"). Kan animeras i containern via en wrapper.
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10.5} stroke={colors.accentTint} strokeWidth={2.5} />
        <Path d="M12 1.5A10.5 10.5 0 0 0 1.5 12" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={11} stroke={colors.lineStrong} strokeWidth={1.5} />
    </Svg>
  );
}

/** Platshållare när nyckelbilden saknas: tonad yta med en diskret bildsymbol. */
function FramePlaceholder({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" stroke={colors.faint} strokeWidth={1.6} />
        <Path d="M4.5 16l4.2-4.2a1.5 1.5 0 0 1 2.1 0L15 16m-1.5-1.5 1.7-1.7a1.5 1.5 0 0 1 2.1 0l2.2 2.2" stroke={colors.faint} strokeWidth={1.6} strokeLinecap="round" />
        <Circle cx={15.5} cy={8.5} r={1.4} fill={colors.faint} />
      </Svg>
    </View>
  );
}
