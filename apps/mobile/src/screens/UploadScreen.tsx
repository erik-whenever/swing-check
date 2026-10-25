import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';

import { BrandHeader, Button, Card, Chip, Segmented, Text, live, useTheme, type SegmentOption } from '../ui';

/** Svingfönster i sekunder inom klippet. */
export interface SwingWindow {
  start: number;
  end: number;
}

export interface UploadScreenProps {
  /** Hälsning, t.ex. `greetingFor()` + "\nRedo för dagens ". Utelämnad = bara varumärkesraden. */
  greeting?: string;
  /** Grönt avslutande ord, t.ex. "svingar?". */
  greetingHighlight?: string;
  /** Rund kameraknapp uppe till höger (gå till inspelning). Utelämnad = ingen knapp. */
  onRecord?: () => void;

  /** Klippets förhandsvisning (videospelare eller affischbild) som containern renderar. */
  preview?: ReactNode;
  /** Klippets namn och längd, t.ex. "IMG_4127 · 0:08". */
  clipLabel: string;
  onChangeClip: () => void;

  /** Klippets längd i sekunder. */
  duration: number;
  /** Svingfönstret som poseSegments hittat. `null` = ingen sving hittad än/alls. */
  swingWindow: SwingWindow | null;
  /** Användaren justerar fönstret. Containern äger tillståndet och klampning mot klippet. */
  onSwingWindowChange: (next: SwingWindow) => void;

  angle: CameraAngle;
  /** true = vinkeln är förifylld från detekteringen (visar "Upptäckt automatiskt"). */
  angleDetected: boolean;
  onAngleChange: (angle: CameraAngle) => void;

  /** Regelsetets rad, t.ex. "Rekommenderat regelset". */
  ruleSetTitle: string;
  /** T.ex. "5 regler · fokus på viktöverföring". */
  ruleSetSubtitle: string;
  onOpenRuleSet: () => void;

  /** Uppskattad analystid i sekunder (visas avrundad under knappen). */
  estimatedSeconds: number;
  onAnalyze: () => void;
  /** false = knappen inaktiv (t.ex. ingen sving hittad). Standard true. */
  canAnalyze?: boolean;
  style?: StyleProp<ViewStyle>;
}

const ANGLE_OPTIONS: readonly SegmentOption<CameraAngle>[] = [
  { value: 'dtl', label: 'Längs linjen' },
  { value: 'face-on', label: 'Framifrån' },
];

/** Antal streck i tidslinjen (skissen: ~40). Varje streck är en tryckyta. */
const TICKS = 40;
/** Steg för skärmläsarens öka/minska på fönstret. */
const NUDGE_S = 0.1;

/** Svensk decimal: 2.4 → "2,4". */
export function formatSeconds(s: number): string {
  return s.toFixed(1).replace('.', ',');
}

function formatClock(s: number): string {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Uppladdning (d1-v2 `png/uppladdning-{light,dark}.png`, d1/README "Skärm för skärm").
 * Ren presentationskomponent: inga state-hooks, ingen navigation, inga nätanrop.
 */
export function UploadScreen({
  greeting,
  greetingHighlight,
  onRecord,
  preview,
  clipLabel,
  onChangeClip,
  duration,
  swingWindow,
  onSwingWindowChange,
  angle,
  angleDetected,
  onAngleChange,
  ruleSetTitle,
  ruleSetSubtitle,
  onOpenRuleSet,
  estimatedSeconds,
  onAnalyze,
  canAnalyze = true,
  style,
}: UploadScreenProps) {
  const { colors, space, radius } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <BrandHeader
          greeting={greeting}
          highlight={greetingHighlight}
          trailing={onRecord ? <RecordButton onPress={onRecord} /> : undefined}
        />

        {/* Klippkort med tidslinje ovanpå videon. */}
        <View
          style={{
            marginTop: space.xl,
            aspectRatio: 820 / 575,
            borderRadius: radius.card,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>{preview}</View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.md }}>
            <Chip label={clipLabel} tone="glass" tnum />
            <Pressable accessibilityRole="button" accessibilityLabel="Byt klipp" onPress={onChangeClip} hitSlop={8}>
              <Chip label="Byt klipp" tone="glass" />
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
          <Timeline duration={duration} window={swingWindow} onChange={onSwingWindowChange} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.xxl, marginBottom: space.sm, paddingHorizontal: 4 }}>
          <Text variant="headline">Kameravinkel</Text>
          {angleDetected ? (
            <Text variant="subhead" color="muted">
              Upptäckt automatiskt
            </Text>
          ) : null}
        </View>
        <Segmented options={ANGLE_OPTIONS} value={angle} onChange={onAngleChange} accessibilityLabel="Kameravinkel" />

        <Pressable accessibilityRole="button" accessibilityLabel={`${ruleSetTitle}, ${ruleSetSubtitle}`} onPress={onOpenRuleSet} style={({ pressed }) => ({ marginTop: space.md, opacity: pressed ? 0.82 : 1 })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.icon, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' }}>
              <SparkleIcon color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline" numberOfLines={1}>
                {ruleSetTitle}
              </Text>
              <Text variant="subhead" color="muted" numberOfLines={1}>
                {ruleSetSubtitle}
              </Text>
            </View>
            <ChevronIcon color={colors.faint} />
          </Card>
        </Pressable>
      </ScrollView>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm }}>
        <Button title="Bedöm svingen" onPress={onAnalyze} disabled={!canAnalyze} />
        <Text variant="footnote" color="muted" style={{ textAlign: 'center' }}>
          {`Tar ungefär ${Math.max(1, Math.round(estimatedSeconds))} sekunder`}
        </Text>
      </View>
    </View>
  );
}

interface TimelineProps {
  duration: number;
  window: SwingWindow | null;
  onChange: (next: SwingWindow) => void;
}

/**
 * Tidslinje i glas ovanpå videon. Fönstret ritas i volt (maskinseende: det är poseSegments fynd).
 * Justering: tryck på ett streck → närmaste kant flyttas dit. Skärmläsare: öka/minska flyttar
 * hela fönstret 0,1 s.
 */
function Timeline({ duration, window, onChange }: TimelineProps) {
  const { space, colors } = useTheme();
  const volt = colors.volt;
  const safeDur = duration > 0 ? duration : 1;
  const tickTime = (i: number) => ((i + 0.5) / TICKS) * safeDur;

  // OSÄKER: kanterna dras inte (drag kräver gesthantering/state i containern); tryck-för-att-flytta
  // är en ren ersättning. Risk låg — dragbara handtag kan läggas till i containern utan att props ändras.
  const moveNearestEdge = (t: number) => {
    if (!window) {
      onChange({ start: Math.max(0, t - 0.8), end: Math.min(safeDur, t + 0.8) });
      return;
    }
    const toStart = Math.abs(t - window.start);
    const toEnd = Math.abs(t - window.end);
    if (toStart <= toEnd) onChange({ start: Math.min(t, window.end - NUDGE_S), end: window.end });
    else onChange({ start: window.start, end: Math.max(t, window.start + NUDGE_S) });
  };

  const nudge = (delta: number) => {
    if (!window) return;
    const len = window.end - window.start;
    const start = Math.min(Math.max(0, window.start + delta), safeDur - len);
    onChange({ start, end: start + len });
  };

  const inWindow = (i: number) => !!window && tickTime(i) >= window.start && tickTime(i) <= window.end;
  const label = window ? `${formatSeconds(window.start)}–${formatSeconds(window.end)} s` : null;

  return (
    <View style={{ margin: space.md, marginTop: 0, padding: space.md, paddingBottom: space.sm, borderRadius: 18, backgroundColor: live.glass }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: window ? volt : live.unk }} />
        <Text variant="subhead" weight={600} color={window ? volt : live.fgDim}>
          {window ? 'Sving hittad' : 'Ingen sving hittad'}
        </Text>
        {label ? (
          <Text variant="subhead" color={live.fgDim} tnum>
            {label}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text variant="subhead" color={live.fgDim} tnum>
          {formatClock(duration)}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Svingfönster"
        accessibilityValue={label ? { text: label } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? NUDGE_S : -NUDGE_S)}
        style={{ flexDirection: 'row', height: 28, alignItems: 'stretch' }}
      >
        {Array.from({ length: TICKS }, (_, i) => {
          const on = inWindow(i);
          const first = on && !inWindow(i - 1);
          const last = on && !inWindow(i + 1);
          return (
            <Pressable
              key={i}
              onPress={() => moveNearestEdge(tickTime(i))}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                // Volt-ram runt fönstret, byggd av strecken.
                borderColor: volt,
                borderTopWidth: on ? 2 : 0,
                borderBottomWidth: on ? 2 : 0,
                borderLeftWidth: first ? 2 : 0,
                borderRightWidth: last ? 2 : 0,
                borderTopLeftRadius: first ? 6 : 0,
                borderBottomLeftRadius: first ? 6 : 0,
                borderTopRightRadius: last ? 6 : 0,
                borderBottomRightRadius: last ? 6 : 0,
                backgroundColor: on ? 'rgba(255, 255, 255, 0.06)' : undefined,
              }}
            >
              <View style={{ width: 2, height: 16, borderRadius: 1, backgroundColor: on ? live.fg : 'rgba(255, 255, 255, 0.28)' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RecordButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Spela in"
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x={2.5} y={6} width={13} height={12} rx={3} stroke={colors.fg} strokeWidth={1.8} />
        <Path d="M15.5 10.5 21 7.5v9l-5.5-3" stroke={colors.fg} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

function SparkleIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill={color}>
      <Path d="M8 3l1.3 3.7L13 8l-3.7 1.3L8 13l-1.3-3.7L3 8l3.7-1.3z" />
      <Path d="M14.5 12l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </Svg>
  );
}

function ChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={10} height={16} viewBox="0 0 10 16" fill="none">
      <Path d="M2 2l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
