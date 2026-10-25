// Regelbiblioteket (N-3.6 del 10) — ren presentation. Vägen in från Regler ("Egna" / "+"),
// d1 README "Regler": biblioteket är kärnprodukten (G2). Bygger på regler-*.png:s radmönster
// (titel, vikt-prickar, fas, "Ej validerad", nedtonad med vad som krävs). Filtrering och
// gruppering i ./ruleLibraryLogic; skärmen visar och rapporterar via callbacks.

import { Pressable, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import { Button, Card, Chip, Segmented, Text, textStyle, useTheme } from '../ui';
import { ANGLE_LABEL_SV, PHASE_LABEL, weightDots } from './reviewLogic';
import {
  PHASE_ORDER,
  groupLibrary,
  phaseCounts,
  resultLabel,
  selectedCount,
  selectedLabel,
  type LibraryRow,
  type PhaseFilter,
} from './ruleLibraryLogic';

export interface RuleLibraryScreenProps {
  /** Hela biblioteket (RULE_LIBRARY från core). */
  library: readonly LibraryRule[];
  query: string;
  onQueryChange: (query: string) => void;
  phase: PhaseFilter;
  onPhaseChange: (phase: PhaseFilter) => void;
  /** Vald kameravinkel — regler som inte kan bedömas från den tonas ned (filtreras inte bort). */
  angle: CameraAngle;
  onAngleChange: (angle: CameraAngle) => void;
  /** Valda regler (id) i det egna setet. */
  selectedIds: ReadonlySet<string>;
  onToggle: (ruleId: string) => void;
  /** Regler som klarat V-1 (accuracyVerdict === 'pass'). Utelämnad → alla "Ej validerad". */
  validatedIds?: ReadonlySet<string>;
  onDone: () => void;
  style?: StyleProp<ViewStyle>;
}

const ANGLES = [
  { value: 'dtl', label: ANGLE_LABEL_SV.dtl },
  { value: 'face-on', label: ANGLE_LABEL_SV['face-on'] },
] as const;

export function RuleLibraryScreen(props: RuleLibraryScreenProps) {
  const theme = useTheme();
  const { colors, space } = theme;
  const groups = groupLibrary(props);
  const counts = phaseCounts(props.library);
  const chosen = selectedCount(props.library, props.selectedIds);
  const anyUnvalidated = groups.some((g) => g.rows.some((r) => !r.validated));
  const phases: PhaseFilter[] = ['all', ...PHASE_ORDER];

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, props.style]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
          <Text variant="eyebrow">{`Biblioteket · ${props.library.length} regler`}</Text>
          <Text variant="largeTitle" accessibilityRole="header" style={{ marginTop: space.xs }}>
            Regelbiblioteket
          </Text>
          <Text variant="subhead" color="muted" style={{ marginTop: space.xs }}>
            Välj vad coachen ska titta efter i dina svingar.
          </Text>
        </View>

        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              minHeight: 44,
              paddingHorizontal: space.md,
              borderRadius: 12,
              backgroundColor: colors.raised,
            }}
          >
            <Svg width={17} height={17} viewBox="0 0 17 17" accessibilityElementsHidden importantForAccessibility="no">
              <Circle cx={7.25} cy={7.25} r={5.25} stroke={colors.muted} strokeWidth={1.8} fill="none" />
              <Path d="M11.2 11.2 15 15" stroke={colors.muted} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
            <TextInput
              value={props.query}
              onChangeText={props.onQueryChange}
              placeholder="Sök regel eller fas"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Sök i regelbiblioteket"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[textStyle(theme, 'body'), { flex: 1, color: colors.fg, paddingVertical: space.sm }]}
            />
          </View>

          <Segmented options={ANGLES} value={props.angle} onChange={props.onAngleChange} accessibilityLabel="Kameravinkel" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingVertical: space.md }}
          accessibilityRole="tablist"
          accessibilityLabel="Fas"
        >
          {phases.map((p) => {
            const on = p === props.phase;
            const label = p === 'all' ? 'Alla' : PHASE_LABEL[p];
            return (
              <Pressable
                key={p}
                onPress={() => !on && props.onPhaseChange(p)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label}, ${counts[p]} regler`}
                hitSlop={{ top: 8, bottom: 8 }}
                disabled={counts[p] === 0 && !on}
                style={{ opacity: counts[p] === 0 && !on ? 0.45 : 1 }}
              >
                <Chip tone={on ? 'accent' : 'neutral'} label={`${label} ${counts[p]}`} tnum />
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: space.lg }}>
          <Text variant="footnote" color="muted" style={{ paddingHorizontal: space.xs, marginBottom: space.sm }}>
            {`${resultLabel(groups)} · bedöms säkert ${ANGLE_LABEL_SV[props.angle].toLowerCase()}`}
          </Text>

          {groups.length === 0 ? (
            <Card>
              <Text variant="subhead" color="muted">
                {props.query.trim() ? `Inga regler matchar "${props.query.trim()}".` : 'Inga regler i den här fasen.'}
              </Text>
            </Card>
          ) : (
            groups.map((g) => (
              <View key={g.phase} style={{ marginBottom: space.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.sm, paddingHorizontal: space.xs }}>
                  <Text variant="eyebrow" accessibilityRole="header">{g.label}</Text>
                  <Text variant="footnote" color="muted" tnum>
                    {`${g.rows.filter((r) => r.selected).length} av ${g.rows.length}`}
                  </Text>
                </View>
                <Card padding={0}>
                  {g.rows.map((row, i) => (
                    <LibraryRuleRow key={row.rule.id} row={row} first={i === 0} onToggle={() => props.onToggle(row.rule.id)} />
                  ))}
                </Card>
              </View>
            ))
          )}

          {anyUnvalidated ? (
            // F-1/ADR-0005: inga regler är uppmätta mot facit än (V-1) — säg det öppet, som i Regler.
            <Text variant="footnote" color="muted" style={{ paddingHorizontal: space.xs }}>
              Ej validerad = regeln är inte uppmätt mot facit än. Domen kan vara fel oftare.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: space.lg,
          right: space.lg,
          bottom: space.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
        }}
      >
        <View
          style={{ flex: 1, minHeight: 56, borderRadius: 999, justifyContent: 'center', paddingHorizontal: space.xl, backgroundColor: colors.chrome }}
          accessibilityLiveRegion="polite"
        >
          <Text variant="headline" tnum>{selectedLabel(chosen)}</Text>
        </View>
        <Button title="Klar" onPress={props.onDone} style={{ minWidth: 132 }} />
      </View>
    </View>
  );
}

function LibraryRuleRow({ row, first, onToggle }: { row: LibraryRow; first: boolean; onToggle: () => void }) {
  const { colors, space } = useTheme();
  const { rule, selected, need, validated } = row;
  const dimmed = need !== null;
  const dots = weightDots(rule.weight);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={rule.title}
      accessibilityHint={[
        `${PHASE_LABEL[rule.phase]}, vikt ${rule.weight} av 3`,
        validated ? null : 'ej validerad',
        need,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        paddingVertical: space.md + 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.line,
        backgroundColor: pressed ? colors.raised : 'transparent',
      })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="headline" color={dimmed ? 'faint' : 'fg'}>{rule.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: 2 }}>
          <View style={{ flexDirection: 'row', gap: 3, opacity: dimmed ? 0.5 : 1 }}>
            {dots.map((on, i) => (
              <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? colors.fgDim : colors.lineStrong }} />
            ))}
          </View>
          <Text variant="subhead" color={dimmed ? 'faint' : 'muted'}>{PHASE_LABEL[rule.phase]}</Text>
          {!validated ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: colors.unkTint, opacity: dimmed ? 0.6 : 1 }}>
              <Text variant="caption" color="unk">Ej validerad</Text>
            </View>
          ) : null}
        </View>
        {need ? (
          <Text variant="subhead" color="gold" style={{ marginTop: 2 }}>{need}</Text>
        ) : null}
      </View>
      <SelectMark on={selected} />
    </Pressable>
  );
}

/** Rund bock (iOS-urvalsmönster): fylld accent när vald, tunn ring annars. */
function SelectMark({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? colors.accent : 'transparent',
        borderWidth: on ? 0 : 1.5,
        borderColor: colors.lineStrong,
      }}
    >
      {on ? (
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path d="M2.5 7.4 5.6 10.4 11.5 3.8" stroke={colors.onAccent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}
