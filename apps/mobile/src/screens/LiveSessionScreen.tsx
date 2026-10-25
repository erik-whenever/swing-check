// Livesession (N-3.6 del 7) — ren presentation. Designkälla: docs/design/d1-v2/png/livesession.png
// (.s5 i d1-v2/index.html) och d1 README "Skärm för skärm → Livesession". G1-skärmen: telefon på
// stativ 2–4 m bort, läses utan att gå fram. Alltid mörk. Rösten/hörlurarna styr; skärmen bekräftar.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text, ThemeProvider, VerdictMark, live, useTheme } from '../ui';
import {
  elapsedLabel,
  focusTrendBlocks,
  liveScore,
  liveStatusText,
  toLiveVerdict,
  trendCountLabel,
  type LiveStatus,
  type LiveVerdict,
  type TrendBlock,
} from './liveSessionLogic';

export interface LiveRuleVerdict {
  id: string;
  /** Kort dom, helst `short_verdict` ordagrant ("Vikten kvar bak"). */
  title: string;
  verdict: LiveVerdict | 'cannot_determine';
}

export interface LiveSessionScreenProps {
  /** Kameraförhandsvisningen; läggs bakom, nedtonad. */
  camera?: ReactNode;
  status: LiveStatus;
  /** Ersätter tillståndets standardundertext ("Slå när du vill"). */
  statusDetail?: string;
  /** Ljudvägens namn ("AirPods"); utelämnad → chipet döljs. */
  audioRouteLabel?: string;
  /** Senaste svingens nummer i sessionen; `null` före första svingen. */
  swingNumber: number | null;
  elapsedMs: number;
  /** Senaste svingens domar (aktiva regler, i visningsordning). Visas max tre. */
  latest: readonly LiveRuleVerdict[];
  /** Fokusregelns trend: titel + dom per sving, äldst först. Utelämnad → ingen trendrad. */
  focus?: { title: string; history: readonly (LiveVerdict | 'cannot_determine' | null)[] };
  onPause: () => void;
  /** Visas i stället för Paus när `status === 'paused'`. */
  onResume: () => void;
  onEnd: () => void;
}

/** Max antal domrader — fler ryms inte i 30 pt på en telefon och läses inte på avstånd. */
const MAX_VERDICTS = 3;
const VOLT = '#D6F03A';
const VOLT_TINT = 'rgba(214, 240, 58, 0.10)';
const VOLT_LINE = 'rgba(214, 240, 58, 0.35)';
/** Stor display får inte växa med Dynamic Type — layouten är redan dimensionerad för 3 m. */
const NO_SCALE = 1;

export function LiveSessionScreen(props: LiveSessionScreenProps) {
  return (
    <ThemeProvider scheme="dark">
      <LiveSessionBody {...props} />
    </ThemeProvider>
  );
}

function LiveSessionBody({
  camera,
  status,
  statusDetail,
  audioRouteLabel,
  swingNumber,
  elapsedMs,
  latest,
  focus,
  onPause,
  onResume,
  onEnd,
}: LiveSessionScreenProps) {
  const { space } = useTheme();
  const rows = latest.slice(0, MAX_VERDICTS);
  const score = liveScore(latest.map((r) => r.verdict));
  const blocks = focus ? focusTrendBlocks(focus.history) : null;
  const statusText = liveStatusText(status);
  const paused = status === 'paused';

  return (
    <View style={{ flex: 1, backgroundColor: live.bg, overflow: 'hidden' }}>
      {camera ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {camera}
        </View>
      ) : null}
      {/* OSÄKER: skissen suddar kameran (blur 5px). Utan expo-blur (nytt beroende) tonas den bara ned
          med gradientslöjan nedan; låg risk — slöjan är 74–98 % täckande, så detaljerna stör ändå inte.
          Byt till BlurView om expo-blur tas in. */}
      <Veil />

      <View style={{ flex: 1, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg }}>
        {/* Topprad: LIVE + ljudväg */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View
            accessible
            accessibilityLabel={paused ? 'Sessionen är pausad' : 'Livesession pågår'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: 'rgba(214, 240, 58, 0.14)' }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: VOLT, boxShadow: '0px 0px 0px 5px rgba(214, 240, 58, 0.22)', opacity: paused ? 0.4 : 1 }} />
            <Text variant="headline" color={VOLT} weight={700} maxFontSizeMultiplier={1.2} style={{ letterSpacing: 0.7 }}>
              {paused ? 'PAUS' : 'LIVE'}
            </Text>
          </View>
          {audioRouteLabel ? (
            <View
              accessible
              accessibilityLabel={`Ljud via ${audioRouteLabel}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.10)' }}
            >
              <HeadphonesIcon />
              <Text variant="subhead" color={live.fg} weight={600} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {audioRouteLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Svingräknare + tid */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg, paddingHorizontal: space.sm }}>
          <Text variant="title2" color={live.fgDim} weight={600} maxFontSizeMultiplier={1.2} style={{ fontSize: 20, lineHeight: 24 }}>
            {swingNumber == null ? (
              'Ingen sving än'
            ) : (
              <>
                Sving <Text variant="title2" color={live.fg} style={{ fontSize: 20, lineHeight: 24 }}>{swingNumber}</Text> · senaste
              </>
            )}
          </Text>
          <Text variant="title2" color={live.fgDim} weight={600} tnum maxFontSizeMultiplier={1.2} style={{ fontSize: 20, lineHeight: 24 }}>
            {elapsedLabel(elapsedMs)}
          </Text>
        </View>

        {/* Poäng 120 pt */}
        <View
          accessible
          accessibilityLabel={score.assessable ? `${score.passed} av ${score.assessable} godkända` : 'Ingen poäng än'}
          style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: space.xs, marginTop: space.xs }}
        >
          <Text variant="largeTitle" color={live.fg} weight={600} tnum maxFontSizeMultiplier={NO_SCALE} style={{ fontSize: 120, lineHeight: 120, letterSpacing: -5.4 }}>
            {score.assessable ? score.passed : '–'}
          </Text>
          {score.assessable ? (
            <Text variant="largeTitle" color="rgba(255, 255, 255, 0.45)" weight={500} tnum maxFontSizeMultiplier={NO_SCALE} style={{ fontSize: 64, lineHeight: 70, letterSpacing: -1.9 }}>
              /{score.assessable}
            </Text>
          ) : null}
        </View>

        {/* Domar 30 pt med 52 pt formmärken */}
        <View style={{ gap: 14, marginTop: space.lg, paddingHorizontal: space.sm }}>
          {rows.map((r) => {
            const v = toLiveVerdict(r.verdict);
            return (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                <VerdictMark verdict={v} size={52} onLive />
                <Text
                  variant="title1"
                  color={v === 'fail' ? '#FFD9CB' : v === 'unknown' ? live.fgDim : live.fg}
                  weight={600}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  maxFontSizeMultiplier={1.2}
                  style={{ flex: 1, fontSize: 30, lineHeight: 34, letterSpacing: -0.45 }}
                >
                  {r.title}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={{ flex: 1, minHeight: space.lg }} />

        {/* Fokusregelns trend: sju block */}
        {focus && blocks ? (
          <View style={{ paddingHorizontal: space.sm, marginBottom: space.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="headline" color={live.fgDim} numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ flexShrink: 1 }}>
                Fokus · {focus.title}
              </Text>
              <Text variant="headline" color="gold" tnum maxFontSizeMultiplier={1.2}>
                {trendCountLabel(blocks)}
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={`Fokus ${focus.title}: ${trendCountLabel(blocks) || 'inga svingar än'}`}
              style={{ flexDirection: 'row', gap: space.sm, marginTop: 10 }}
            >
              {blocks.map((b, i) => (
                <TrendBlockView key={i} block={b} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Tillstånd 36 pt volt */}
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${statusText.title}. ${statusDetail ?? statusText.detail}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 18,
            paddingVertical: 18,
            paddingHorizontal: space.xl,
            borderRadius: 28,
            borderCurve: 'continuous',
            backgroundColor: VOLT_TINT,
            borderWidth: 1.5,
            borderColor: VOLT_LINE,
          }}
        >
          <StatusPulse status={status} />
          <View style={{ flex: 1 }}>
            <Text variant="largeTitle" color={VOLT} weight={700} numberOfLines={1} maxFontSizeMultiplier={NO_SCALE} style={{ fontSize: 36, lineHeight: 40, letterSpacing: -0.72 }}>
              {statusText.title}
            </Text>
            <Text variant="body" color="rgba(255, 255, 255, 0.7)" weight={500} numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 3 }}>
              {statusDetail ?? statusText.detail}
            </Text>
          </View>
        </View>

        {/* Kontroller 76 pt */}
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
          <ControlButton
            label={paused ? 'Fortsätt' : 'Paus'}
            onPress={paused ? onResume : onPause}
            icon={paused ? <PlayIcon color={live.fg} /> : <PauseIcon color={live.fg} />}
            variant="glass"
          />
          <ControlButton label="Avsluta" onPress={onEnd} icon={<StopIcon color="#0B110E" />} variant="solid" />
        </View>
      </View>
    </View>
  );
}

function Veil() {
  // Skissens .veil: rgba(5,8,6) 78 % → 74 % (30 %) → 90 % (62 %) → 98 % (100 %).
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="liveVeil" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#050806" stopOpacity={0.78} />
          <Stop offset="0.3" stopColor="#050806" stopOpacity={0.74} />
          <Stop offset="0.62" stopColor="#050806" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#050806" stopOpacity={0.98} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#liveVeil)" />
    </Svg>
  );
}

function TrendBlockView({ block }: { block: TrendBlock }) {
  const base = { flex: 1, height: 34, borderRadius: 10, borderCurve: 'continuous' as const };
  const ring = block.now ? { boxShadow: `0px 0px 0px 3px ${live.bg}, 0px 0px 0px 5px #FFFFFF` } : null;
  switch (block.kind) {
    case 'pass':
      return <View style={[base, { backgroundColor: '#52C98A' }, ring]} />;
    case 'fail':
      return <View style={[base, { borderWidth: 3, borderColor: '#F2845F' }, ring]} />;
    case 'unknown':
      // OSÄKER: RN:s streckade kant med radie renderas olika på Android (se VerdictMark); iOS först.
      return <View style={[base, { borderWidth: 2, borderStyle: 'dashed', borderColor: live.unk }, ring]} />;
    default:
      return <View style={[base, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]} />;
  }
}

function StatusPulse({ status }: { status: LiveStatus }) {
  // OSÄKER: README beskriver en långsamt andande puls (Reducera rörelse → tona). Ren presentationsskärm
  // utan state/animation här — statisk symbol; animationen läggs i ägaren eller som egen ui-komponent.
  const dim = status === 'paused';
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.45 : 1 }}>
      <View style={{ position: 'absolute', top: -8, left: -8, right: -8, bottom: -8, borderRadius: 36, borderWidth: 3, borderColor: VOLT, opacity: 0.4 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28, borderWidth: 3, borderColor: VOLT }} />
      {status === 'analyzing' ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: VOLT }} />
          ))}
        </View>
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: VOLT }} />
      )}
    </View>
  );
}

function ControlButton({ label, onPress, icon, variant }: { label: string; onPress: () => void; icon: ReactNode; variant: 'glass' | 'solid' }) {
  const solid = variant === 'solid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 76,
        borderRadius: 26,
        borderCurve: 'continuous',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: solid ? '#FFFFFF' : 'rgba(255, 255, 255, 0.12)',
        opacity: pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }], // alltid array, se ui/Button.tsx
      })}
    >
      {icon}
      <Text variant="button" color={solid ? '#0B110E' : live.fg} maxFontSizeMultiplier={1.3} style={{ fontSize: 20, lineHeight: 24 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function HeadphonesIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke={live.fg} strokeWidth={2.2} strokeLinecap="round" />
      <Rect x="3" y="14" width="5" height="7" rx="2" fill={live.fg} />
      <Rect x="16" y="14" width="5" height="7" rx="2" fill={live.fg} />
    </Svg>
  );
}

function PauseIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Rect x="5" y="4" width="4" height="14" rx="1.5" fill={color} />
      <Rect x="13" y="4" width="4" height="14" rx="1.5" fill={color} />
    </Svg>
  );
}

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path d="M6 4.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 6 4.2Z" fill={color} />
    </Svg>
  );
}

function StopIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Rect x="3" y="3" width="14" height="14" rx="3.5" fill={color} />
    </Svg>
  );
}
