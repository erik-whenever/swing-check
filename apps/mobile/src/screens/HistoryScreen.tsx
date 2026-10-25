// Historiken (N-3.6 del 5) — ren presentation. Designkälla: docs/design/d1-v2/png/historik-*.png och
// d1 README "Skärm för skärm → Historik". Fokusregelns trend överst, sedan dagar med sessioner
// (en stapel per sving) och uppladdade svingar (tumnagel + prickar). Rensad video (N-3.5) märks.
// Del 13: en sessionsrad fälls ut till sina svingar; data sammanställs i historyLogic.ts.

import { useState } from 'react';
import { Image, Pressable, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { Card, Text, useTheme } from '../ui';
import {
  ANGLE_LABEL_SV,
  clock,
  countLabel,
  groupByDay,
  passPercent,
  sessionBar,
  shortDate,
  trendDelta,
  type SwingDot,
} from './reviewLogic';
import type { HistoryItem, HistorySession, HistorySwing, HistoryTrend } from './historyLogic';

export type { HistoryItem, HistorySession, HistorySwing, HistoryTrend, TrendPoint } from './historyLogic';

export interface HistoryScreenProps {
  /** Utelämnad (ingen fokusregel än) → inget trendkort. */
  trend?: HistoryTrend | null;
  items: readonly HistoryItem[];
  /** Tryck på en svingrad (även inuti en utfälld session). Sessionsrader fälls ut i skärmen. */
  onOpen: (item: HistorySwing) => void;
  /** Klockan för "Idag"/"Igår" — injiceras så att skärmen är ren och testbar. */
  now: number;
  /** Kugghjulet bredvid rubriken (del 14). Utelämnad → ingen knapp. */
  onSettings?: () => void;
  style?: StyleProp<ViewStyle>;
}

const timeOf = (i: HistoryItem) => (i.kind === 'session' ? i.startedAt : i.timestamp);

export function HistoryScreen({ trend, items, onOpen, now, onSettings, style }: HistoryScreenProps) {
  const { colors, space } = useTheme();
  const days = groupByDay(items, timeOf, now);
  // Utfällda sessioner är ren UI-state (som trendkortets bredd) — ingen data ägs här.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg, paddingHorizontal: space.xs }}>
          <Text variant="largeTitle" accessibilityRole="header">
            Historik
          </Text>
          {onSettings ? <SettingsButton onPress={onSettings} /> : null}
        </View>

        {trend ? <TrendCard trend={trend} now={now} /> : null}

        {days.length === 0 ? (
          <Card style={{ marginTop: space.lg }}>
            <Text variant="subhead" color="muted">Inga svingar än. Analysera ett klipp eller starta en session.</Text>
          </Card>
        ) : null}

        {days.map((day) => {
          const sessions = day.items.filter((i) => i.kind === 'session').length;
          const swings = day.items.length - sessions;
          const count = [
            sessions ? countLabel(sessions, 'session', 'sessioner') : null,
            swings ? countLabel(swings, 'klipp', 'klipp') : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={day.key} style={{ marginTop: space.xxl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xs, marginBottom: space.md }}>
                <Text variant="title2" style={{ fontSize: 20 }}>{day.label}</Text>
                <Text variant="subhead" color="muted">{count}</Text>
              </View>
              <View style={{ gap: space.md }}>
                {day.items.map((item) =>
                  item.kind === 'session' ? (
                    <SessionRow
                      key={item.id}
                      item={item}
                      expanded={open.has(item.id)}
                      onPress={() => toggle(item.id)}
                      onOpenSwing={onOpen}
                    />
                  ) : (
                    <SwingRow key={item.id} item={item} onPress={() => onOpen(item)} />
                  ),
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TrendCard({ trend, now }: { trend: HistoryTrend; now: number }) {
  const { colors, space } = useTheme();
  const [w, setW] = useState(0);
  const delta = trendDelta(trend.points);
  const h = 120;
  const pad = 8;
  const n = trend.points.length;
  const xy = trend.points.map((p, i) => ({
    x: n > 1 ? pad + (i / (n - 1)) * (w - 2 * pad) : w / 2,
    y: pad + (1 - Math.max(0, Math.min(100, p.value)) / 100) * (h - 2 * pad),
  }));
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = xy.length > 1 ? `${line} L${xy[xy.length - 1].x.toFixed(1)} ${h} L${xy[0].x.toFixed(1)} ${h} Z` : '';
  const last = xy[xy.length - 1];
  // Upp till fyra axeletiketter, jämnt fördelade, sista = senaste punkten.
  const labelIdx = n <= 4 ? trend.points.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const up = delta !== null && delta >= 0;

  return (
    <Card style={{ padding: space.xl }}>
      <Text variant="eyebrow">{`★ ${trend.ruleTitle}`}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
        <Text variant="largeTitle" tnum style={{ fontSize: 52, lineHeight: 58 }}>{`${Math.round(trend.percent)} %`}</Text>
        {delta !== null && delta !== 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: space.md,
              paddingVertical: space.xs,
              borderRadius: 999,
              backgroundColor: up ? colors.passTint : colors.failTint,
            }}
          >
            <Text variant="chip" color={up ? 'pass' : 'fail'} tnum style={{ fontSize: 15 }}>
              {`${up ? '▲' : '▼'} ${Math.abs(delta)} p.e.`}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="subhead" color="muted">{`godkända ${trend.windowLabel}`}</Text>

      <View
        style={{ height: h, marginTop: space.lg }}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        accessibilityLabel={`Trend för ${trend.ruleTitle}`}
      >
        {w > 0 && n > 0 ? (
          <Svg width={w} height={h}>
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.pass} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.pass} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke={colors.lineStrong} strokeDasharray="3 5" />
            ))}
            {area ? <Path d={area} fill="url(#trendFill)" /> : null}
            {n > 1 ? <Path d={line} stroke={colors.pass} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            <Circle cx={last.x} cy={last.y} r={6} fill={colors.surface} stroke={colors.pass} strokeWidth={3} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
        {labelIdx.map((i) => (
          <Text key={i} variant="footnote" color="muted">{shortDate(trend.points[i].timestamp, now)}</Text>
        ))}
      </View>
    </Card>
  );
}

function SessionRow({
  item,
  expanded,
  onPress,
  onOpenSwing,
}: {
  item: HistorySession;
  expanded: boolean;
  onPress: () => void;
  onOpenSwing: (swing: HistorySwing) => void;
}) {
  const { colors, space } = useTheme();
  const passed = item.swings.reduce((s, x) => s + x.passed, 0);
  const assessable = item.swings.reduce((s, x) => s + x.assessable, 0);
  const pct = passPercent(passed, assessable);
  const barH = 40;
  const canExpand = (item.swingItems?.length ?? 0) > 0;
  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        onPress={canExpand ? onPress : undefined}
        accessibilityRole="button"
        accessibilityState={canExpand ? { expanded } : undefined}
        accessibilityHint={canExpand ? (expanded ? 'Döljer svingarna' : 'Visar svingarna') : undefined}
      >
        <Card style={{ padding: space.xl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="headline" numberOfLines={1}>{item.title}</Text>
              <Text variant="subhead" color="muted" tnum>
                {`${countLabel(item.swings.length, 'sving', 'svingar')} · ${clock(item.startedAt)}–${clock(item.endedAt)}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
              {pct !== null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="title2" tnum>{`${pct} %`}</Text>
                  <Text variant="footnote" color="muted">godkända</Text>
                </View>
              ) : null}
              {canExpand ? (
                <Text variant="headline" color="muted" style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>›</Text>
              ) : null}
            </View>
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: barH, marginTop: space.lg }}
            accessible
            accessibilityLabel={`${item.swings.length} svingar, ${pct ?? 0} procent godkända`}
          >
            {item.swings.map((s, i) => {
              const bar = sessionBar(s.passed, s.assessable);
              return (
                <View
                  key={i}
                  style={
                    bar
                      ? { flex: 1, height: barH * bar.height, borderRadius: 4, backgroundColor: bar.tone === 'pass' ? colors.pass : colors.fail }
                      : { flex: 1, height: barH * 0.3, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.faint }
                  }
                />
              );
            })}
          </View>
        </Card>
      </Pressable>
      {expanded && item.swingItems
        ? item.swingItems.map((s) => <SwingRow key={s.id} item={s} onPress={() => onOpenSwing(s)} inset />)
        : null}
    </View>
  );
}

function SwingRow({ item, onPress, inset = false }: { item: HistorySwing; onPress: () => void; inset?: boolean }) {
  const { colors, space, radius } = useTheme();
  const sub = [clock(item.timestamp), item.angle ? ANGLE_LABEL_SV[item.angle] : null].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={inset ? { marginLeft: space.xl } : undefined}>
      <Card style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.inner,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: item.thumbnailUri ? '#2F5A3A' : colors.raised,
          }}
        >
          {item.thumbnailUri ? <Image source={{ uri: item.thumbnailUri }} style={{ flex: 1 }} resizeMode="cover" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>{item.title ?? 'Uppladdat klipp'}</Text>
          <Text variant="subhead" color="muted" tnum numberOfLines={1}>{sub}</Text>
          {item.videoPurged ? (
            <Text variant="caption" color="faint" style={{ marginTop: 2 }}>Video rensad · resultatet finns kvar</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: space.xs }}>
          <Text variant="headline" tnum>{`${item.passed}/${item.assessable}`}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityLabel={`${item.passed} av ${item.assessable} godkända`}>
            {item.dots.map((d, i) => (
              <Dot key={i} dot={d} first={i === 0} />
            ))}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** Fokusregeln (först) är en rundad fyrkant, övriga runda; okänd = streckad ring (d1: tre former överallt). */
function Dot({ dot, first }: { dot: SwingDot; first: boolean }) {
  const { colors } = useTheme();
  const size = 11;
  if (dot === 'unknown') {
    return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.unk }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: first ? 3 : size / 2,
        backgroundColor: dot === 'pass' ? colors.pass : colors.fail,
      }}
    />
  );
}

/** Rund ikonknapp (samma form som Uppladdningens inspelningsknapp) till Inställningar. */
function SettingsButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Inställningar"
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={3.2} stroke={colors.fg} strokeWidth={1.8} />
        <Path
          d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"
          stroke={colors.fg}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}
