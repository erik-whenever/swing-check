// Containers (N-3.6 del 6): connect the pure screens in src/screens to the state hooks and
// navigation. Screens stay presentation-only; everything stateful lives here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type CompositeNavigationProp, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { PlayerLevel, RulePhase } from '@swingcheck/core/lib/recommendRules';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';

import { AnalysisScreen, PHASE_ORDER } from '../screens/AnalysisScreen';
import { HistoryScreen, type HistoryItem } from '../screens/HistoryScreen';
import { ResultScreen, type ResultRuleInfo } from '../screens/ResultScreen';
import { RulesScreen } from '../screens/RulesScreen';
import { UploadScreen, type SwingWindow } from '../screens/UploadScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { clock, dayLabel, historySwingView } from '../screens/reviewLogic';
import { useActiveRules, useHistory, useHistoryEntry, useRuleSelection, useSettings } from '../state';
import { greetingFor, Text, useTheme } from '../ui';
import type { RootStackParamList, TabParamList } from './routes';
import { idleProgress, startUploadAnalysis, UPLOAD_PIPELINE_AVAILABLE, type PipelineProgress } from './uploadPipeline';

type TabNav<T extends keyof TabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;
type StackNav = NativeStackNavigationProp<RootStackParamList>;

/** Clock for "Idag"/"Igår", refreshed whenever the screen gains focus (keeps render pure). */
function useNowOnFocus(): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => setNow(Date.now()), []));
  return now;
}

/** Screens draw edge to edge; the container pads below the status bar / island. */
function useTopInset() {
  return { paddingTop: useSafeAreaInsets().top };
}

// ── Välkommen ────────────────────────────────────────────────────────────────

// OSÄKER: only page 1 has copy in d1-v2; pages 2–4 are written here from the G1/rule-library
// pitch. Risk: low — copy only, easy to change.
const WELCOME_PAGES = [
  { titleLead: 'Se din sving som ', titleHighlight: 'coachen', titleTail: ' ser den.', body: 'Filma, få en dom per regel och hör vad du ska göra – direkt i hörlurarna.' },
  { titleLead: 'Ställ telefonen, ', titleHighlight: 'svinga', titleTail: '.', body: 'Livesessionen hittar varje sving själv. Du behöver aldrig röra telefonen på rangen.' },
  { titleLead: 'Regler du ', titleHighlight: 'förstår', titleTail: '.', body: 'Varje bedömning följer en tydlig regel ur biblioteket – rekommenderade för din nivå, eller dina egna.' },
  { titleLead: 'Allt stannar ', titleHighlight: 'hos dig', titleTail: '.', body: 'Klipp och resultat sparas på telefonen. Inget konto behövs för att komma igång.' },
] as const;

export function WelcomeContainer() {
  const { updateSettings } = useSettings();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const finish = useCallback(() => void updateSettings({ welcomeSeen: true }), [updateSettings]);
  const page = WELCOME_PAGES[step];
  const last = step === WELCOME_PAGES.length - 1;
  return (
    <WelcomeScreen
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      step={step}
      stepCount={WELCOME_PAGES.length}
      eyebrow={step === 0 ? `${WELCOME_PAGES.length} snabba steg` : undefined}
      titleLead={page.titleLead}
      titleHighlight={page.titleHighlight}
      titleTail={page.titleTail}
      body={page.body}
      ctaLabel={step === 0 ? 'Kom igång' : last ? 'Börja svinga' : 'Nästa'}
      onNext={last ? finish : () => setStep(step + 1)}
      onSkip={last ? undefined : finish}
      skipLabel="Hoppa över"
    />
  );
}

// ── Uppladdning ──────────────────────────────────────────────────────────────

export function UploadContainer() {
  const navigation = useNavigation<TabNav<'Swing'>>();
  const { settings } = useSettings();
  const [angle, setAngle] = useState<CameraAngle>(settings.defaultAngle);
  const [swingWindow, setSwingWindow] = useState<SwingWindow | null>(null);
  const active = useActiveRules({ angle });
  const count = active.rules.length;

  // TODO(N-3.x): clip picker + poseSegments. No clip yet → duration 0 and no swing window.
  const duration = 0;
  const greeting = `${greetingFor(new Date())}\nRedo för dagens `;

  return (
    <UploadScreen
      style={useTopInset()}
      greeting={greeting}
      greetingHighlight="svingar?"
      onRecord={() => navigation.navigate('Session')}
      clipLabel="Inget klipp valt"
      onChangeClip={() => {
        // TODO(N-3.x): open the clip picker (uploadPipeline.ts).
      }}
      duration={duration}
      swingWindow={swingWindow}
      onSwingWindowChange={setSwingWindow}
      angle={angle}
      angleDetected={false}
      onAngleChange={setAngle}
      ruleSetTitle={active.mode === 'recommended' ? 'Rekommenderat regelset' : 'Egna regler'}
      ruleSetSubtitle={`${count} ${count === 1 ? 'regel' : 'regler'}`}
      onOpenRuleSet={() => navigation.navigate('Rules')}
      estimatedSeconds={20}
      // OSÄKER: in __DEV__ the button opens the (idle) Analys screen so the stack can be checked
      // before the pipeline exists. Risk: low — dev builds only.
      canAnalyze={(UPLOAD_PIPELINE_AVAILABLE || __DEV__) && !active.empty}
      onAnalyze={() => navigation.navigate('Analysis')}
    />
  );
}

// ── Analys pågår ─────────────────────────────────────────────────────────────

export function AnalysisContainer() {
  const navigation = useNavigation<StackNav>();
  const { settings } = useSettings();
  const active = useActiveRules({ angle: settings.defaultAngle });
  const [state, setState] = useState<PipelineProgress>(idleProgress);
  const [phase, setPhase] = useState<RulePhase>(PHASE_ORDER[0]);
  useEffect(() => startUploadAnalysis(setState), []);
  return (
    <AnalysisScreen
      style={useTopInset()}
      steps={state.steps}
      frames={{}}
      activePhase={phase}
      onSelectPhase={setPhase}
      ruleCount={active.rules.length}
      remainingSeconds={state.remainingSeconds}
      progress={state.progress}
      onCancel={() => navigation.goBack()}
    />
  );
}

// ── Livesession (platshållare) ───────────────────────────────────────────────

/** Placeholder until src/screens/LiveSessionScreen.tsx is wired in (built separately). */
export function LiveSessionPlaceholder() {
  const { colors, space } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xxl }, useTopInset()]}>
      <Text variant="title2" style={{ textAlign: 'center' }}>Livesession</Text>
      <Text variant="callout" color="muted" style={{ textAlign: 'center', marginTop: space.sm }}>
        Kommer snart – handsfri bedömning på rangen.
      </Text>
    </View>
  );
}

// ── Regler ───────────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<PlayerLevel, string> = { beginner: 'Nybörjare', intermediate: 'Medelnivå', advanced: 'Avancerad' };

export function RulesContainer() {
  const navigation = useNavigation<TabNav<'Rules'>>();
  const { settings } = useSettings();
  const { mode, customRuleIds, setMode, setCustomRuleIds, toggleRule } = useRuleSelection();
  const active = useActiveRules();
  const { entries } = useHistory();
  const enabledIds = useMemo(
    () => new Set(mode === 'custom' ? customRuleIds : active.rules.map((r) => r.libraryId)),
    [mode, customRuleIds, active.rules],
  );
  const onToggle = useCallback(
    (id: string) => {
      if (mode === 'custom') return void toggleRule(id);
      // OSÄKER: switching off a recommended rule turns the set into "Egna" seeded with the
      // recommendation minus that rule — the recommended set itself is not editable.
      // Risk: medium — product decision; the alternative is a per-rule "hidden" list.
      const seeded = active.rules.map((r) => r.libraryId).filter((x) => x !== id);
      void setCustomRuleIds(seeded).then(() => setMode('custom'));
    },
    [mode, toggleRule, active.rules, setCustomRuleIds, setMode],
  );
  return (
    <RulesScreen
      style={useTopInset()}
      mode={mode}
      onModeChange={(m) => void setMode(m)}
      rules={active.rules}
      angle={active.angle}
      levelLabel={LEVEL_LABEL[settings.level]}
      focusRuleId={entries[0]?.focusRuleId}
      enabledIds={enabledIds}
      onToggle={onToggle}
      onAdd={() => {
        // TODO(N-3.x): rule picker from the full library (own rules).
      }}
      onApply={() => navigation.navigate('Swing')}
    />
  );
}

// ── Historik ─────────────────────────────────────────────────────────────────

export function HistoryContainer() {
  const navigation = useNavigation<TabNav<'History'>>();
  const { entries } = useHistory();
  const now = useNowOnFocus();
  // OSÄKER: live sessions are not grouped into HistorySession rows yet (no session records in
  // HistoryEntry, see skarmar.md). Every entry shows as a single swing. Risk: low.
  const items = useMemo<HistoryItem[]>(
    () => entries.map((e) => ({ ...historySwingView(e), kind: 'swing', title: 'Uppladdat klipp' })),
    [entries],
  );
  return (
    <HistoryScreen
      style={useTopInset()}
      items={items}
      now={now}
      onOpen={(item) => {
        if (item.kind === 'swing') navigation.navigate('Result', { entryId: item.id, fromHistory: true });
      }}
    />
  );
}

// ── Resultat ─────────────────────────────────────────────────────────────────

// OSÄKER: library titles/drills are English in core; Swedish rule texts do not exist yet.
// Risk: low — ruleInfo is the only place to swap.
const RULE_INFO: Record<string, ResultRuleInfo> = Object.fromEntries(
  RULE_LIBRARY.map((r) => [r.id, { title: r.title, drill: r.drills[0] }]),
);

export function ResultContainer() {
  const navigation = useNavigation<StackNav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Result'>>();
  const entry = useHistoryEntry(params.entryId);
  const [phase, setPhase] = useState<RulePhase>('impact');
  const { colors } = useTheme();
  const top = useTopInset();
  const now = useNowOnFocus();
  if (!entry) return <View style={[{ flex: 1, backgroundColor: colors.bg }, top]} />;
  return (
    <ResultScreen
      style={top}
      title={`${dayLabel(entry.timestamp, now)} ${clock(entry.timestamp)}`}
      backLabel={params.fromHistory ? 'Historik' : 'Tillbaka'}
      onBack={() => navigation.goBack()}
      analysis={{
        rules: entry.results,
        focus_rule: entry.results.find((r) => r.id === entry.focusRuleId),
        overall_assessment: entry.overallAssessment,
      }}
      ruleInfo={RULE_INFO}
      angle={entry.cameraAngle}
      posterUri={entry.framesPurged ? null : (entry.frameUris[0] ?? null)}
      phase={phase}
      onPhaseChange={setPhase}
      onReadAloud={() => {
        // TODO(N-3.6): connect src/tts when it lands (built separately).
      }}
      onNext={params.fromHistory ? undefined : () => navigation.navigate('Tabs', { screen: 'Swing' })}
    />
  );
}
