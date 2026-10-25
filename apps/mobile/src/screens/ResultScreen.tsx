// Resultatskärmen (N-3.6 del 5) — ren presentation. Designkälla: docs/design/d1-v2/png/resultat-*.png
// och d1 README "Skärm för skärm → Resultat". All data och alla handlingar kommer via props.

import { useState } from 'react';
import { Image, Pressable, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { RuleResult, SwingAnalysis } from '@swingcheck/core/types';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { RulePhase } from '@swingcheck/core/lib/recommendRules';
import {
  Button,
  Card,
  Chip,
  ConfidenceBar,
  Text,
  VerdictMark,
  useButtonForeground,
  useTheme,
  type Verdict,
} from '../ui';
import { ANGLE_LABEL_SV, framesLabel, orderResultRows, PHASE_SHORT, resultScore, type ResultRow } from './reviewLogic';

/** Punkt i klippets koordinater, normaliserad 0–1 (x åt höger, y nedåt). */
export interface TracerPoint {
  x: number;
  y: number;
}

/** Visningsinfo per regel-id (titel ur regelbiblioteket/användarens regel + ev. drill). */
export interface ResultRuleInfo {
  title: string;
  drill?: { title: string; description: string };
}

export interface ResultScreenProps {
  /** Rubrik i navigeringsraden, t.ex. "Idag 10:42". */
  title: string;
  backLabel?: string;
  onBack?: () => void;
  onShare?: () => void;
  analysis: Pick<SwingAnalysis, 'rules' | 'focus_rule' | 'overall_assessment'>;
  /** Kort rubrik för helhetsbedömningen ("Stark rotation"). Utelämnad → bara overall_assessment. */
  headline?: string;
  /** Titel/drill per RuleResult.id. Saknas id → id:t visas. */
  ruleInfo: Readonly<Record<string, ResultRuleInfo>>;
  angle?: CameraAngle;
  /** Uppspelningshastighet som visas i chippet, t.ex. 0.25. */
  playbackRate?: number;
  /** Stillbild från klippet bakom tracern (fil-URI). Ingen video här — spelaren läggs på av skärmens ägare. */
  posterUri?: string | null;
  /** Skaftets bana; utelämnad → bara platshållaren. */
  tracer?: readonly TracerPoint[];
  /** Index i `tracer` som markeras med prickar (t.ex. topp och träff). */
  tracerMarks?: readonly number[];
  phases?: readonly RulePhase[];
  phase: RulePhase;
  onPhaseChange: (phase: RulePhase) => void;
  onReadAloud: () => void;
  /** Utelämnad → ingen "Nästa sving"-knapp (t.ex. öppnad ur historiken). */
  onNext?: () => void;
  nextLabel?: string;
  /** "Se i bild 5 och 6" tryckt. */
  onOpenFrames?: (frames: number[], ruleId: string) => void;
  /** Läser upp just nu → knappen visar "Stoppa". */
  reading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_PHASES: readonly RulePhase[] = ['address', 'top', 'downswing', 'impact', 'follow'];

const verdictOf = (r: RuleResult): Verdict => (r.verdict === 'pass' ? 'pass' : r.verdict === 'fail' ? 'fail' : 'unknown');

function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')}×`;
}

export function ResultScreen(props: ResultScreenProps) {
  const { colors, space } = useTheme();
  const { analysis, ruleInfo } = props;
  const rows = orderResultRows(analysis.rules, analysis.focus_rule);
  const score = resultScore(analysis.rules, analysis.focus_rule);
  const focusRow = rows[0]?.kind === 'focus' ? rows[0] : null;
  const restRows = focusRow ? rows.slice(1) : rows;
  const tonalFg = useButtonForeground('secondary');

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, props.style]}>
      <NavBar title={props.title} backLabel={props.backLabel} onBack={props.onBack} onShare={props.onShare} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 120 }}>
        <TracerHero {...props} />

        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', marginTop: space.xl, marginBottom: space.lg }}>
          <ScoreRing passed={score.passed} assessable={score.assessable} />
          <View style={{ flex: 1 }}>
            <Text variant="eyebrow">{`Helhetsbedömning · ${score.passed} av ${score.assessable}`}</Text>
            {props.headline ? <Text variant="title2" style={{ marginTop: 2 }}>{props.headline}</Text> : null}
            <Text variant="subhead" color="muted" style={{ marginTop: 2 }}>
              {analysis.overall_assessment}
            </Text>
          </View>
        </View>

        {focusRow ? (
          <Card focus padding={0}>
            <RuleRow row={focusRow} info={ruleInfo[focusRow.result.id]} onOpenFrames={props.onOpenFrames} />
          </Card>
        ) : null}

        {restRows.length > 0 ? (
          <Card padding={0} style={{ marginTop: space.md }}>
            {restRows.map((row, i) => (
              <View key={row.result.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : null}>
                <RuleRow row={row} info={ruleInfo[row.result.id]} onOpenFrames={props.onOpenFrames} />
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          gap: space.md,
          padding: space.lg,
          paddingBottom: space.xxl,
          backgroundColor: colors.chrome,
          borderTopWidth: 1,
          borderTopColor: colors.line,
        }}
      >
        <Button
          variant="secondary"
          title={props.reading ? 'Stoppa' : 'Läs upp'}
          icon={<SpeakerIcon color={tonalFg} />}
          onPress={props.onReadAloud}
          accessibilityLabel={props.reading ? 'Stoppa uppläsningen' : 'Läs upp resultatet'}
          style={{ flex: 1 }}
        />
        {props.onNext ? (
          <Button title={props.nextLabel ?? 'Nästa sving'} onPress={props.onNext} style={{ flex: 1 }} />
        ) : null}
      </View>
    </View>
  );
}

function NavBar({ title, backLabel, onBack, onShare }: Pick<ResultScreenProps, 'title' | 'backLabel' | 'onBack' | 'onShare'>) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.md }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Svg width={12} height={20} viewBox="0 0 12 20">
              <Path d="M10 2 2 10l8 8" stroke={colors.accent} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text variant="body" color="accent">{backLabel ?? 'Historik'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="headline" tnum numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {onShare ? (
          <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Dela" hitSlop={10}>
            <Svg width={22} height={24} viewBox="0 0 22 24">
              <Path d="M11 15V2M6 6.5 11 2l5 4.5M4 11v10h14V11" stroke={colors.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TracerHero(props: ResultScreenProps) {
  const { colors, space, radius } = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const pts = (props.tracer ?? []).map((p) => ({ x: p.x * size.w, y: p.y * size.h }));
  const d = pts.length > 1 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : null;
  const phases = props.phases ?? DEFAULT_PHASES;

  return (
    <View
      onLayout={onLayout}
      style={{
        aspectRatio: 400 / 352,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        overflow: 'hidden',
        // Platshållare: mörk gräsgrön yta (skissens klipp) tills stillbild/video finns — samma i båda teman.
        backgroundColor: '#2F5A3A',
      }}
      accessibilityLabel="Skaftets bana över klippet"
    >
      {props.posterUri ? (
        <Image source={{ uri: props.posterUri }} style={{ position: 'absolute', inset: 0 }} resizeMode="cover" />
      ) : null}
      {d && size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
          {/* Glöd + bana i volt (maskinseende — aldrig dom). */}
          <Path d={d} stroke={colors.volt} strokeOpacity={0.3} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={d} stroke={colors.volt} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {(props.tracerMarks ?? []).map((i) =>
            pts[i] ? <Circle key={i} cx={pts[i].x} cy={pts[i].y} r={6} fill="#0B110E" stroke={colors.volt} strokeWidth={3} /> : null,
          )}
        </Svg>
      ) : null}

      <View style={{ position: 'absolute', top: space.md, left: space.md, flexDirection: 'row', gap: space.sm }}>
        {props.angle ? <Chip tone="glass" label={ANGLE_LABEL_SV[props.angle]} /> : null}
        {props.playbackRate ? <Chip tone="glass" tnum label={`▸ ${formatRate(props.playbackRate)}`} /> : null}
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          position: 'absolute',
          left: space.md,
          right: space.md,
          bottom: space.md,
          flexDirection: 'row',
          padding: 4,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(10, 14, 12, 0.5)',
        }}
      >
        {phases.map((p) => {
          const on = p === props.phase;
          return (
            <Pressable
              key={p}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => !on && props.onPhaseChange(p)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                flex: 1,
                minHeight: 36,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? '#FFFCF5' : undefined,
              }}
            >
              <Text variant="segment" weight={on ? 600 : undefined} color={on ? '#15201A' : 'rgba(255,255,255,0.85)'} numberOfLines={1}>
                {PHASE_SHORT[p]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ScoreRing({ passed, assessable }: { passed: number; assessable: number }) {
  const { colors } = useTheme();
  const size = 76;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = assessable > 0 ? passed / assessable : 0;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`${passed} av ${assessable} godkända`}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.raised} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.pass}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
        <Text variant="title2" tnum>{passed}</Text>
        <Text variant="subhead" color="muted" tnum style={{ alignSelf: 'flex-end', marginBottom: 22 }}>
          {`/${assessable}`}
        </Text>
      </View>
    </View>
  );
}

function RuleRow({
  row,
  info,
  onOpenFrames,
}: {
  row: ResultRow;
  info?: ResultRuleInfo;
  onOpenFrames?: ResultScreenProps['onOpenFrames'];
}) {
  const { colors, space, radius } = useTheme();
  const [open, setOpen] = useState(row.defaultOpen);
  const r = row.result;
  const unknown = row.kind === 'unknown';
  const tip = r.suggestion ?? r.correction;
  const drillText = r.drill_suggestion;
  const drill = info?.drill;
  const frames = framesLabel(r.relevant_frames);
  // "Kan inte avgöras" säger alltid varför (d1 README); den raden har ingen detalj att fälla ut.
  const sub = unknown
    ? `Kan inte avgöras${r.observation || r.short_verdict ? `: ${r.observation ?? r.short_verdict}` : ''}`
    : r.short_verdict ?? r.observation;
  const hasDetail = !unknown && Boolean(tip || drillText || drill || frames);

  return (
    <Pressable
      disabled={!hasDetail}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole={hasDetail ? 'button' : undefined}
      accessibilityState={hasDetail ? { expanded: open } : undefined}
      style={{ flexDirection: 'row', gap: space.md, padding: space.lg }}
    >
      <VerdictMark verdict={verdictOf(r)} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          {row.kind === 'focus' ? (
            <Text variant="eyebrow">★ Fokus</Text>
          ) : (
            <Text variant="headline" style={{ flex: 1 }}>{info?.title ?? r.id}</Text>
          )}
          {unknown ? null : <ConfidenceBar value={r.confidence} />}
        </View>
        {row.kind === 'focus' ? <Text variant="headline" style={{ marginTop: 2 }}>{info?.title ?? r.id}</Text> : null}
        {sub ? (
          <Text variant="subhead" color={row.kind === 'focus' ? 'fgDim' : 'muted'} style={{ marginTop: 2 }}>
            {sub}
          </Text>
        ) : null}

        {open && hasDetail ? (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {tip ? (
              <View style={{ backgroundColor: colors.raised, borderRadius: radius.inner, padding: space.lg }}>
                <Text variant="eyebrow">Gör så här</Text>
                <Text variant="subhead" style={{ marginTop: space.xs }}>{tip}</Text>
              </View>
            ) : null}
            {drill || drillText ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.md,
                  alignItems: 'center',
                  backgroundColor: colors.accentTint,
                  borderRadius: radius.inner,
                  padding: space.md,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.icon,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Svg width={20} height={20} viewBox="0 0 20 20">
                    <Path d="M4 16 14 4M12 4h3v3" stroke={colors.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={5} cy={16} r={2} fill={colors.accent} />
                  </Svg>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="accent">DRILL</Text>
                  <Text variant="subhead" weight={600}>{drill?.title ?? drillText}</Text>
                  {drill && drillText ? <Text variant="footnote" color="muted">{drillText}</Text> : null}
                  {drill && !drillText ? <Text variant="footnote" color="muted">{drill.description}</Text> : null}
                </View>
              </View>
            ) : null}
            {frames ? (
              <Pressable
                disabled={!onOpenFrames}
                onPress={() => onOpenFrames?.(r.relevant_frames, r.id)}
                accessibilityRole="link"
                hitSlop={10}
                style={{ paddingVertical: space.xs }}
              >
                <Text variant="subhead" color="accent" weight={600}>{`${frames} ›`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SpeakerIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={20} viewBox="0 0 22 20">
      <Path d="M2 7h4l5-4v14l-5-4H2z" fill={color} />
      <Path d="M14.5 6.5a5 5 0 0 1 0 7M17.5 4a8.5 8.5 0 0 1 0 12" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
