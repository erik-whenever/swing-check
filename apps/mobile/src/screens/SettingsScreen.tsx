// Inställningar (N-3.5 UI-resten, N-3.6 del 14) — ren presentation. Språk (prompt + uppläsning),
// nivå och standardvinkel (rekommenderat regelset, F-1) samt medietaket (N-3.5). d1-v2 har ingen
// skiss för vyn; den byggs av befintliga komponenter (SectionLabel, Card, Segmented).
// Logik i ./settingsLogic; skärmen visar och rapporterar via callbacks.

import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AnalysisLanguage } from '@swingcheck/core/lib/language';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { PlayerLevel } from '@swingcheck/core/lib/recommendRules';
import { Button, Card, SectionLabel, Segmented, Text, useTheme } from '../ui';
import { ANGLE_LABEL_SV } from './reviewLogic';
import { capOptions, LANGUAGE_OPTIONS, LEVEL_OPTIONS, storageSummary } from './settingsLogic';

export interface SettingsScreenProps {
  language: AnalysisLanguage;
  onLanguageChange: (language: AnalysisLanguage) => void;
  level: PlayerLevel;
  onLevelChange: (level: PlayerLevel) => void;
  defaultAngle: CameraAngle;
  onDefaultAngleChange: (angle: CameraAngle) => void;
  mediaCapMb: number;
  /** Containern bekräftar först om det nya taket rensar media. */
  onMediaCapChange: (capMb: number) => void;
  /** Faktiska bytes för video + bildrutor på disk. */
  usedBytes: number;
  /** Antal svingar vars video redan rensats. */
  purgedCount: number;
  onDone: () => void;
  style?: StyleProp<ViewStyle>;
}

const ANGLES = [
  { value: 'dtl', label: ANGLE_LABEL_SV.dtl },
  { value: 'face-on', label: ANGLE_LABEL_SV['face-on'] },
] as const;

export function SettingsScreen(props: SettingsScreenProps) {
  const { colors, space } = useTheme();
  const storage = storageSummary(props.usedBytes, props.mediaCapMb);

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, props.style]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }}>
        <Text variant="largeTitle" accessibilityRole="header" style={{ paddingTop: space.sm, paddingBottom: space.lg, paddingHorizontal: space.xs }}>
          Inställningar
        </Text>

        <SectionLabel>Språk</SectionLabel>
        <Card style={{ gap: space.sm, marginBottom: space.xl }}>
          <Segmented options={LANGUAGE_OPTIONS} value={props.language} onChange={props.onLanguageChange} accessibilityLabel="Språk" />
          <Text variant="footnote" color="muted">
            Bedömningen och uppläsningen i hörlurarna använder samma språk.
          </Text>
        </Card>

        <SectionLabel>Regelset</SectionLabel>
        <Card style={{ gap: space.md, marginBottom: space.xl }}>
          <View style={{ gap: space.sm }}>
            <Text variant="subhead" color="muted">Din nivå</Text>
            <Segmented options={LEVEL_OPTIONS} value={props.level} onChange={props.onLevelChange} accessibilityLabel="Nivå" />
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="subhead" color="muted">Kameravinkel som standard</Text>
            <Segmented options={ANGLES} value={props.defaultAngle} onChange={props.onDefaultAngleChange} accessibilityLabel="Kameravinkel som standard" />
          </View>
          <Text variant="footnote" color="muted">
            Det rekommenderade regelsetet utgår från nivån och vinkeln.
          </Text>
        </Card>

        <SectionLabel>Lagring</SectionLabel>
        <Card style={{ gap: space.sm, marginBottom: space.xl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="headline">Video och bildrutor</Text>
            <Text variant="subhead" color="muted" tnum>{storage.label}</Text>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Lagring ${storage.label}`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(storage.fraction * 100) }}
            style={{ height: 6, borderRadius: 3, backgroundColor: colors.raised, overflow: 'hidden' }}
          >
            <View style={{ width: `${storage.fraction * 100}%`, height: '100%', backgroundColor: colors.accent }} />
          </View>
          <Text variant="subhead" color="muted" style={{ marginTop: space.sm }}>Tak</Text>
          <Segmented
            options={capOptions(props.mediaCapMb)}
            value={String(props.mediaCapMb)}
            onChange={(v) => props.onMediaCapChange(Number(v))}
            accessibilityLabel="Tak för lagring"
          />
          <Text variant="footnote" color="muted">
            {`När taket nås rensas video från de äldsta svingarna först, sedan bildrutor. Resultaten sparas alltid.${
              props.purgedCount > 0 ? ` ${props.purgedCount} ${props.purgedCount === 1 ? 'sving' : 'svingar'} har redan video rensad.` : ''
            }`}
          </Text>
        </Card>

        <Button title="Klar" onPress={props.onDone} />
      </ScrollView>
    </View>
  );
}
