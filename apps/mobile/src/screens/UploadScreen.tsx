import { useState } from 'react';
import { Image, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';

import { BrandHeader, Button, Card, Chip, Segmented, Text, live, useTheme, type SegmentOption } from '../ui';
import { moveEdge, nearestEdge, stripIndexAt, timeAtX, type SwingWindow, type WindowEdge } from './uploadLogic';

export type { SwingWindow } from './uploadLogic';

export interface UploadScreenProps {
  /** Hälsning, t.ex. `greetingFor()` + "\nRedo för dagens ". Utelämnad = bara varumärkesraden. */
  greeting?: string;
  /** Grönt avslutande ord, t.ex. "svingar?". */
  greetingHighlight?: string;
  /** Rund kameraknapp uppe till höger (gå till inspelning). Utelämnad = ingen knapp. */
  onRecord?: () => void;

  /** false = inget klipp valt: kortet blir en uppmaning att välja ett. */
  hasClip: boolean;
  /**
   * Filmremsa: stillbilder jämnt över klippet (`stripTimes`). Tom tills containern tagit fram dem.
   * Förhandsvisningen visar bilden vid den kant som senast drogs.
   */
  stripUris?: readonly string[];
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
  hasClip,
  stripUris = [],
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

        {hasClip ? (
          <ClipCard
            clipLabel={clipLabel}
            onChangeClip={onChangeClip}
            duration={duration}
            swingWindow={swingWindow}
            onSwingWindowChange={onSwingWindowChange}
            stripUris={stripUris}
          />
        ) : (
          <EmptyClipCard onPickClip={onChangeClip} />
        )}

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

/** Kortets mått: stående som klippen från telefonen, hela bredden. */
const CLIP_ASPECT = 3 / 4;

/** Inget klipp valt: hela kortet är en uppmaning att välja ett. */
function EmptyClipCard({ onPickClip }: { onPickClip: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Välj ett svingklipp"
      onPress={onPickClip}
      style={({ pressed }) => ({
        marginTop: space.xl,
        aspectRatio: CLIP_ASPECT,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.line,
        backgroundColor: colors.raised,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xxl,
        gap: space.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' }}>
        <ClipIcon color={colors.accent} />
      </View>
      <Text variant="title2" style={{ textAlign: 'center' }}>
        Ladda upp en sving
      </Text>
      <Text variant="body" color="muted" style={{ textAlign: 'center' }}>
        Välj ett klipp från kamerarullen. Hela svingen ska synas, från uppställning till avslut.
      </Text>
      <Button title="Välj klipp" onPress={onPickClip} style={{ marginTop: space.sm, alignSelf: 'stretch' }} />
    </Pressable>
  );
}

interface ClipCardProps {
  clipLabel: string;
  onChangeClip: () => void;
  duration: number;
  swingWindow: SwingWindow | null;
  onSwingWindowChange: (next: SwingWindow) => void;
  stripUris: readonly string[];
}

/** Valt klipp: stillbild vid den kant som dras, filmremsa med dragbart fönster under. */
function ClipCard({ clipLabel, onChangeClip, duration, swingWindow, onSwingWindowChange, stripUris }: ClipCardProps) {
  const { space, radius } = useTheme();
  // Kanten som senast drogs styr stillbilden, så att man ser uppställningen resp. avslutet.
  const [edge, setEdge] = useState<WindowEdge>('start');
  const previewTime = swingWindow ? (edge === 'start' ? swingWindow.start : swingWindow.end) : 0;
  const previewUri = stripUris.length ? stripUris[stripIndexAt(previewTime, duration, stripUris.length)] : null;

  return (
    <View
      style={{
        marginTop: space.xl,
        aspectRatio: CLIP_ASPECT,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: '#0B110E',
      }}
    >
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} resizeMode="contain" />
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: space.md }}>
        <Chip label={clipLabel} tone="glass" tnum />
        <Pressable accessibilityRole="button" accessibilityLabel="Byt klipp" onPress={onChangeClip} hitSlop={8}>
          <Chip label="Byt klipp" tone="glass" />
        </Pressable>
      </View>
      <View style={{ flex: 1 }} />
      <Timeline
        duration={duration}
        window={swingWindow}
        onChange={onSwingWindowChange}
        onEdge={setEdge}
        stripUris={stripUris}
      />
    </View>
  );
}

interface TimelineProps {
  duration: number;
  window: SwingWindow | null;
  onChange: (next: SwingWindow) => void;
  /** Kanten som dras just nu. */
  onEdge: (edge: WindowEdge) => void;
  stripUris: readonly string[];
}

/**
 * Filmremsa i glas längst ner i klippkortet med svingfönstret i volt. Dra (eller tryck) nära en kant
 * för att flytta den; stillbilden ovanför följer kanten. Skärmläsare: öka/minska flyttar hela
 * fönstret 0,1 s.
 */
function Timeline({ duration, window, onChange, onEdge, stripUris }: TimelineProps) {
  const { space, colors } = useTheme();
  const volt = colors.volt;
  const safeDur = duration > 0 ? duration : 1;
  const [width, setWidth] = useState(0);

  // Kanten som dras just nu (null = inget drag). Den första flytten kan komma före omritningen,
  // därför faller draget tillbaka på närmaste kant.
  const [dragEdge, setDragEdge] = useState<WindowEdge | null>(null);
  const dragTo = (x: number, grant: boolean) => {
    if (!window || width <= 0) return;
    const t = timeAtX(x, width, safeDur);
    const edge = grant || !dragEdge ? nearestEdge(window, t) : dragEdge;
    if (grant) {
      setDragEdge(edge);
      onEdge(edge);
    }
    onChange(moveEdge(window, edge, t, safeDur));
  };

  const nudge = (delta: number) => {
    if (!window) return;
    const len = window.end - window.start;
    const start = Math.min(Math.max(0, window.start + delta), safeDur - len);
    onChange({ start, end: start + len });
  };

  const label = window ? `${formatSeconds(window.start)}–${formatSeconds(window.end)} s` : null;
  const left = window ? (window.start / safeDur) * width : 0;
  const right = window ? (window.end / safeDur) * width : 0;
  const STRIP_H = 48;

  return (
    <View style={{ margin: space.md, marginTop: 0, padding: space.md, paddingBottom: space.md, borderRadius: 18, backgroundColor: live.glass }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.xs }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: volt }} />
        <Text variant="subhead" weight={600} color={volt}>
          Svingen
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
      <Text variant="footnote" color={live.fgDim} style={{ marginBottom: space.sm }}>
        Dra kanterna så att rutan täcker uppställning till avslut.
      </Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Svingfönster"
        accessibilityValue={label ? { text: label } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? NUDGE_S : -NUDGE_S)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: STRIP_H }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // Låt inte ScrollView ta över ett pågående drag.
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => dragTo(e.nativeEvent.locationX, true)}
        onResponderMove={(e) => dragTo(e.nativeEvent.locationX, false)}
        onResponderRelease={() => setDragEdge(null)}
        onResponderTerminate={() => setDragEdge(null)}
      >
        {/* Barnen tar inga tryck, så att locationX alltid mäts mot remsan. */}
        <View pointerEvents="none" style={{ flex: 1 }}>
          <View style={{ flex: 1, flexDirection: 'row', borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
            {stripUris.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ flex: 1, height: STRIP_H }} resizeMode="cover" />
            ))}
          </View>
          {window && width > 0 ? (
            <>
              {/* Dämpa det som ligger utanför fönstret. */}
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: left, backgroundColor: 'rgba(0, 0, 0, 0.55)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} />
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: right, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.55)', borderTopRightRadius: 8, borderBottomRightRadius: 8 }} />
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  bottom: -2,
                  left: left - 2,
                  width: Math.max(4, right - left + 4),
                  borderWidth: 2,
                  borderColor: volt,
                  borderRadius: 8,
                }}
              />
              <Handle x={left} color={volt} />
              <Handle x={right} color={volt} />
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Greppbart handtag på en kant (visuellt; draget hanteras av remsan). */
function Handle({ x, color }: { x: number; color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 8,
        bottom: 8,
        left: x - 6,
        width: 12,
        borderRadius: 6,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: '#0B110E' }} />
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

function ClipIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={3} stroke={color} strokeWidth={1.8} />
      <Path d="M10 9.5v5l4.5-2.5z" fill={color} />
    </Svg>
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
