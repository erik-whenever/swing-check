// Regelvalet (N-3.6 del 5) — ren presentation. Designkälla: docs/design/d1-v2/png/regler-*.png och
// d1 README "Skärm för skärm → Regler". Regelsetet härleds i src/state/rulesModel (deriveActiveRules);
// skärmen visar det och rapporterar val via callbacks.

import { Pressable, ScrollView, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import type { ActiveRule } from '../state/rulesModel';
import type { RuleMode } from '../state/settingsModel';
import { Button, Card, Chip, Segmented, Text, useTheme } from '../ui';
import { ANGLE_LABEL_SV, PHASE_LABEL, requiredAngleText, weightDots } from './reviewLogic';

export interface RulesScreenProps {
  mode: RuleMode;
  onModeChange: (mode: RuleMode) => void;
  /** Det aktiva regelsetet för läget (deriveActiveRules(...).rules). */
  rules: readonly ActiveRule[];
  angle: CameraAngle;
  /** Chip-texter för rekommendationen, t.ex. "Medelnivå", "Jämnare träff" (mål utelämnat → inget chip). */
  levelLabel: string;
  goalLabel?: string;
  /** Regeln som är fokus i senaste analysen (★ Fokus). */
  focusRuleId?: string;
  /** Påslagna regler (id). Avslagna visas kvar men räknas inte i "Använd N regler". */
  enabledIds: ReadonlySet<string>;
  onToggle: (libraryId: string, enabled: boolean) => void;
  /** Regler som inte kan bedömas från vinkeln — visas nedtonade med vad som krävs (Rekommenderat-läget). */
  unavailable?: readonly LibraryRule[];
  /** "+" — lägg till egen regel. */
  onAdd: () => void;
  onApply: () => void;
  style?: StyleProp<ViewStyle>;
}

const MODES = [
  { value: 'recommended', label: 'Rekommenderat' },
  { value: 'custom', label: 'Egna' },
] as const;

export function RulesScreen(props: RulesScreenProps) {
  const { colors, space } = useTheme();
  const usable = props.rules.filter((r) => r.matchesAngle && props.enabledIds.has(r.libraryId)).length;
  const blocked = props.rules.filter((r) => !r.matchesAngle).map((r) => r.rule);
  const greyed = props.mode === 'recommended' ? [...blocked, ...(props.unavailable ?? [])] : blocked;
  const active = props.rules.filter((r) => r.matchesAngle);
  const anyUnvalidated = active.some((r) => r.validation === 'unvalidated');
  const angleText = ANGLE_LABEL_SV[props.angle];

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, props.style]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.md }}>
          <Text variant="largeTitle" accessibilityRole="header">Regler</Text>
          <Pressable
            onPress={props.onAdd}
            accessibilityRole="button"
            accessibilityLabel="Lägg till egen regel"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}
          >
            <Svg width={18} height={18} viewBox="0 0 18 18">
              <Path d="M9 2v14M2 9h14" stroke={colors.fg} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>

        <Segmented options={MODES} value={props.mode} onChange={props.onModeChange} accessibilityLabel="Regelläge" />

        {props.mode === 'recommended' ? (
          <Card style={{ marginTop: space.lg, padding: space.xl }}>
            <Text variant="eyebrow" color="accent">Valt för dig</Text>
            <Text variant="title2" style={{ marginTop: space.xs }}>
              {`${active.length} ${active.length === 1 ? 'regel' : 'regler'} för din vinkel`}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
              <Chip tone="accent" label={angleText} />
              <Chip label={props.levelLabel} />
              {props.goalLabel ? <Chip label={props.goalLabel} /> : null}
            </View>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs }}>
          <Text variant="eyebrow">{props.mode === 'recommended' ? 'I ditt regelset' : 'Dina regler'}</Text>
          <Text variant="footnote" color="muted">{`Bedöms säkert ${angleText.toLowerCase()}`}</Text>
        </View>

        {active.length === 0 && greyed.length === 0 ? (
          <Card>
            <Text variant="subhead" color="muted">
              {props.mode === 'custom'
                ? 'Inga egna regler än. Tryck + för att välja ur biblioteket.'
                : 'Inga regler kan bedömas från den här vinkeln.'}
            </Text>
          </Card>
        ) : (
          <Card padding={0}>
            {active.map((r, i) => (
              <RuleToggleRow
                key={r.libraryId}
                first={i === 0}
                rule={r.rule}
                focus={r.libraryId === props.focusRuleId}
                unvalidated={r.validation === 'unvalidated'}
                enabled={props.enabledIds.has(r.libraryId)}
                onToggle={(on) => props.onToggle(r.libraryId, on)}
              />
            ))}
            {greyed.map((rule, i) => (
              <RuleToggleRow
                key={rule.id}
                first={active.length === 0 && i === 0}
                rule={rule}
                need={requiredAngleText(rule.angles, props.angle) ?? 'Kan inte bedömas från vinkeln'}
              />
            ))}
          </Card>
        )}

        {anyUnvalidated ? (
          // F-1/ADR-0005: inga regler är uppmätta mot facit än (V-1) — säg det öppet.
          <Text variant="footnote" color="muted" style={{ marginTop: space.sm, paddingHorizontal: space.xs }}>
            Ej validerad = regeln är inte uppmätt mot facit än. Domen kan vara fel oftare.
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg }}>
        <Button
          title={`Använd ${usable} ${usable === 1 ? 'regel' : 'regler'}`}
          disabled={usable === 0}
          onPress={props.onApply}
        />
      </View>
    </View>
  );
}

function RuleToggleRow({
  rule,
  first,
  focus,
  unvalidated,
  enabled,
  onToggle,
  need,
}: {
  rule: LibraryRule;
  first: boolean;
  focus?: boolean;
  unvalidated?: boolean;
  enabled?: boolean;
  onToggle?: (on: boolean) => void;
  /** Satt → nedtonad rad som inte kan bedömas från vinkeln. */
  need?: string;
}) {
  const { colors, space } = useTheme();
  const disabled = need !== undefined;
  const dots = weightDots(rule.weight);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        paddingVertical: space.md + 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="headline" color={disabled ? 'faint' : 'fg'}>{rule.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 2 }}>
          {disabled ? (
            <Text variant="subhead" color="gold">{need}</Text>
          ) : (
            <>
              {focus ? <Text variant="subhead" color="gold">★ Fokus</Text> : null}
              <View
                style={{ flexDirection: 'row', gap: 3 }}
                accessible
                accessibilityLabel={`Vikt ${rule.weight} av 3`}
              >
                {dots.map((on, i) => (
                  <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? colors.fgDim : colors.lineStrong }} />
                ))}
              </View>
              <Text variant="subhead" color="muted">{PHASE_LABEL[rule.phase]}</Text>
              {unvalidated ? (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.unkTint }}>
                  <Text variant="caption" color="unk">Ej validerad</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
      <Switch
        value={disabled ? false : Boolean(enabled)}
        disabled={disabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.accent, false: colors.raised }}
        ios_backgroundColor={colors.raised}
        accessibilityLabel={rule.title}
      />
    </View>
  );
}
