// Containers (N-3.6 del 6): connect the pure screens in src/screens to the state hooks and
// navigation. Screens stay presentation-only; everything stateful lives here.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type CompositeNavigationProp, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import {
  accuracyVerdict,
  NO_ACCURACY_DATA,
  type PlayerLevel,
  type RuleAccuracyMap,
  type RulePhase,
} from '@swingcheck/core/lib/recommendRules';
import { RULE_LIBRARY, type LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import type { Rule } from '@swingcheck/core/types';

import { AnalysisScreen, PHASE_ORDER } from '../screens/AnalysisScreen';
import { HistoryScreen, type HistoryItem } from '../screens/HistoryScreen';
import { LiveSessionScreen, type LiveRuleVerdict } from '../screens/LiveSessionScreen';
import { ResultScreen, type ResultRuleInfo } from '../screens/ResultScreen';
import { RuleLibraryScreen } from '../screens/RuleLibraryScreen';
import type { PhaseFilter } from '../screens/ruleLibraryLogic';
import { RulesScreen } from '../screens/RulesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { capChangeWarning } from '../screens/settingsLogic';
import { UploadScreen, type SwingWindow } from '../screens/UploadScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { buildHistoryItems, currentFocusRuleId, focusTrend } from '../screens/historyLogic';
import { clock, dayLabel } from '../screens/reviewLogic';
import {
  analysableRules,
  analysisErrorView,
  useActiveRules,
  useHistory,
  useHistoryEntry,
  useRuleSelection,
  useSettings,
} from '../state';
import { measureMedia } from '../mediaStore';
import { useSpeech, type SpeechSource } from '../tts';
import { greetingFor, live, useTheme } from '../ui';
import { initialLiveSession, liveElapsedMs, liveSessionReducer } from './liveSessionState';
import type { RootStackParamList, TabParamList } from './routes';
import { createUploadDeps, grabStrip, pickClip } from './uploadAdapters';
import { stripTimes } from '../screens/uploadLogic';
import {
  clampWindow,
  defaultSwingWindow,
  idleProgress,
  runUploadAnalysis,
  UploadCancelledError,
  UPLOAD_PIPELINE_AVAILABLE,
  type PickedClip,
  type PipelineProgress,
  type UploadJob,
} from './uploadPipeline';

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

/**
 * The job UploadContainer hands to AnalysisContainer. Held here rather than in route params:
 * it carries the rule objects, and the Analys route stays parameterless (routes.ts).
 */
// OSÄKER: module state is lost if the JS reloads between the two screens; Analys then just
// goes back. Risk: low — the user taps "Bedöm svingen" again.
let pendingUpload: UploadJob | null = null;

/** Library rules → core's Rule shape. The id stays the library id (RULE_INFO, history keys). */
function toCoreRules(rules: readonly LibraryRule[]): Rule[] {
  return rules.map((rule) => ({ ...rule, active: true, libraryId: rule.id }));
}

function clipClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function UploadContainer() {
  const navigation = useNavigation<TabNav<'Swing'>>();
  const { settings } = useSettings();
  const [angle, setAngle] = useState<CameraAngle>(settings.defaultAngle);
  const [clip, setClip] = useState<PickedClip | null>(null);
  const [swingWindow, setSwingWindow] = useState<SwingWindow | null>(null);
  const [stripUris, setStripUris] = useState<string[]>([]);
  const pickedUri = useRef<string | null>(null);
  const active = useActiveRules({ angle });
  const count = active.rules.length;
  const coreRules = useMemo(() => toCoreRules(analysableRules(active)), [active]);

  const duration = clip?.duration ?? 0;
  const greeting = `${greetingFor(new Date())}\nRedo för dagens `;

  const onChangeClip = useCallback(() => {
    void pickClip()
      .then((picked) => {
        if (!picked) return;
        setClip(picked);
        // OSÄKER: no pose (N-3.8) → no detected swing; the window starts as the default and the
        // user drags it. Risk: medium, see defaultSwingWindow.
        setSwingWindow(defaultSwingWindow(picked.duration));
        setStripUris([]);
        // The strip loads after the card shows; a newer pick wins if two overlap.
        pickedUri.current = picked.uri;
        void grabStrip(picked.uri, stripTimes(picked.duration)).then((uris) => {
          if (pickedUri.current === picked.uri) setStripUris(uris);
        });
      })
      .catch((err) => Alert.alert('Kunde inte öppna klippet', String(err instanceof Error ? err.message : err)));
  }, []);

  return (
    <UploadScreen
      style={useTopInset()}
      greeting={greeting}
      greetingHighlight="svingar?"
      onRecord={() => navigation.navigate('Session')}
      hasClip={clip != null}
      stripUris={stripUris}
      clipLabel={clip ? `${clip.name} · ${clipClock(clip.duration)}` : 'Inget klipp valt'}
      onChangeClip={onChangeClip}
      duration={duration}
      swingWindow={swingWindow}
      onSwingWindowChange={(next) => setSwingWindow(clampWindow(next, duration))}
      angle={angle}
      angleDetected={false}
      onAngleChange={setAngle}
      ruleSetTitle={active.mode === 'recommended' ? 'Rekommenderat regelset' : 'Egna regler'}
      ruleSetSubtitle={`${count} ${count === 1 ? 'regel' : 'regler'}`}
      onOpenRuleSet={() => navigation.navigate('Rules')}
      estimatedSeconds={20}
      canAnalyze={UPLOAD_PIPELINE_AVAILABLE && clip != null && coreRules.length > 0}
      onAnalyze={() => {
        if (!clip) return;
        pendingUpload = {
          clip,
          window: clampWindow(swingWindow, clip.duration),
          angle,
          rules: coreRules,
          language: settings.language,
        };
        navigation.navigate('Analysis');
      }}
    />
  );
}

// ── Analys pågår ─────────────────────────────────────────────────────────────

export function AnalysisContainer() {
  const navigation = useNavigation<StackNav>();
  const { settings } = useSettings();
  const { addSwing } = useHistory();
  const [job] = useState(() => pendingUpload);
  const [state, setState] = useState<PipelineProgress>(idleProgress);
  const [phase, setPhase] = useState<RulePhase>(PHASE_ORDER[0]);
  const language = settings.language;
  useEffect(() => {
    if (!job) {
      navigation.goBack();
      return;
    }
    pendingUpload = null;
    const controller = new AbortController();
    runUploadAnalysis(job, createUploadDeps(addSwing), setState, controller.signal)
      .then((entryId) => navigation.replace('Result', { entryId }))
      .catch((err) => {
        if (controller.signal.aborted || err instanceof UploadCancelledError) return;
        const view = analysisErrorView(err, language);
        Alert.alert(view.title, view.message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      });
    return () => controller.abort();
    // Runs once per mounted job; addSwing/language changes must not restart a paid analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);
  return (
    <AnalysisScreen
      style={useTopInset()}
      steps={state.steps}
      frames={{}}
      activePhase={phase}
      onSelectPhase={setPhase}
      ruleCount={job?.rules.length ?? 0}
      remainingSeconds={state.remainingSeconds}
      progress={state.progress}
      onCancel={() => navigation.goBack()}
    />
  );
}

// ── Livesession ──────────────────────────────────────────────────────────────

const KEEP_AWAKE_TAG = 'live-session';

/** Dark stand-in for the camera preview until the live pipeline (N-3.4) exists. */
function CameraPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: '#05070A' }} />;
}

export function LiveSessionContainer() {
  const navigation = useNavigation<TabNav<'Session'>>();
  const insets = useSafeAreaInsets();
  const { stop: stopSpeech } = useSpeech();
  const [session, dispatch] = useReducer(liveSessionReducer, undefined, initialLiveSession);
  const [now, setNow] = useState(() => Date.now());

  // The session runs while the tab is in front: clock starts, screen stays awake (phone on a
  // tripod 2–4 m away, G1). Leaving the tab pauses — nothing is analysed behind the user's back.
  useFocusEffect(
    useCallback(() => {
      dispatch({ type: 'start', now: Date.now() });
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      return () => {
        dispatch({ type: 'pause', now: Date.now() });
        void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      };
    }, []),
  );

  const running = session.runningSince != null;
  useEffect(() => {
    if (!running) return;
    // First tick after ≤1 s; until then liveElapsedMs clamps a stale `now` to the accumulated time.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // TODO(N-3.4 livepipeline): mount the VisionCamera preview as `camera` and feed swing
  // detection into the reducer: on a detected swing dispatch `swingCaptured`; when its analysis
  // returns, dispatch `swingAnalyzed` and call `useSpeech().enqueueLive(result, { swingNumber,
  // focusRuleId, ruleTitle })` — enqueue (not say) so swing N finishes before N+1 is read.
  // OSÄKER: no focus-rule source for a live session yet (settings has none; Regler shows the
  // latest history entry's). The trend row stays hidden until the pipeline decides. Risk: low.
  const latest = useMemo<LiveRuleVerdict[]>(
    () =>
      session.latest.map((r) => ({
        id: r.id,
        title: r.short_verdict?.trim() || RULE_INFO[r.id]?.title || r.id,
        verdict: r.verdict,
      })),
    [session.latest],
  );

  return (
    <View style={{ flex: 1, backgroundColor: live.bg, paddingTop: insets.top, paddingBottom: 0 }}>
      <LiveSessionScreen
        camera={<CameraPlaceholder />}
        status={session.status}
        swingNumber={session.swingCount > 0 ? session.swingCount : null}
        elapsedMs={liveElapsedMs(session, now)}
        latest={latest}
        // OSÄKER: audio route (AirPods etc.) needs a native route query — not in expo-speech.
        // Chip hidden until then. Risk: low — informational.
        audioRouteLabel={undefined}
        onPause={() => {
          stopSpeech();
          dispatch({ type: 'pause', now: Date.now() });
        }}
        onResume={() => dispatch({ type: 'resume', now: Date.now() })}
        onEnd={() => {
          stopSpeech();
          dispatch({ type: 'end' });
          navigation.navigate('Swing');
        }}
      />
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
      onModeChange={(m) => {
        void setMode(m);
        // OSÄKER: every switch to "Egna" opens the library (also when the own set already has
        // rules) — the d1 entry point. Risk: low — one tap "Klar" back if unwanted.
        if (m === 'custom') navigation.navigate('RuleLibrary');
      }}
      rules={active.rules}
      angle={active.angle}
      levelLabel={LEVEL_LABEL[settings.level]}
      focusRuleId={entries[0]?.focusRuleId}
      enabledIds={enabledIds}
      onToggle={onToggle}
      onAdd={() => navigation.navigate('RuleLibrary')}
      onApply={() => navigation.navigate('Swing')}
    />
  );
}

// ── Regelbiblioteket ─────────────────────────────────────────────────────────

// TODO(V-1): feed measured accuracy here; until then no rule is validated.
const LIBRARY_ACCURACY: RuleAccuracyMap = NO_ACCURACY_DATA;
const VALIDATED_IDS: ReadonlySet<string> = new Set(
  RULE_LIBRARY.filter((r) => accuracyVerdict(LIBRARY_ACCURACY[r.id]) === 'pass').map((r) => r.id),
);

export function RuleLibraryContainer() {
  const navigation = useNavigation<StackNav>();
  const { settings } = useSettings();
  const { mode, customRuleIds, setMode, toggleRule } = useRuleSelection();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [angle, setAngle] = useState<CameraAngle>(settings.defaultAngle);
  const insets = useSafeAreaInsets();
  const selectedIds = useMemo(() => new Set(customRuleIds), [customRuleIds]);
  const onToggle = useCallback(
    (id: string) => {
      void toggleRule(id);
      // OSÄKER: picking in the library from "Rekommenderat" (via "+") starts "Egna" from the
      // stored custom list, not seeded with the recommendation. Risk: low — matches "Egna".
      if (mode !== 'custom') void setMode('custom');
    },
    [mode, toggleRule, setMode],
  );
  return (
    <RuleLibraryScreen
      // iOS modal sheet sits below the status bar already; elsewhere it is a full card.
      style={{ paddingTop: Platform.OS === 'ios' ? 0 : insets.top }}
      library={RULE_LIBRARY}
      query={query}
      onQueryChange={setQuery}
      phase={phase}
      onPhaseChange={setPhase}
      angle={angle}
      onAngleChange={setAngle}
      selectedIds={selectedIds}
      onToggle={onToggle}
      validatedIds={VALIDATED_IDS}
      onDone={() => navigation.goBack()}
    />
  );
}

// ── Historik ─────────────────────────────────────────────────────────────────

export function HistoryContainer() {
  const navigation = useNavigation<TabNav<'History'>>();
  const { entries } = useHistory();
  const now = useNowOnFocus();
  // Sessioner grupperas på sessionId, trenden följer den senaste svingens fokusregel (del 13).
  const items = useMemo<HistoryItem[]>(() => buildHistoryItems(entries), [entries]);
  const trend = useMemo(() => {
    const focusId = currentFocusRuleId(entries);
    const title = RULE_LIBRARY.find((r) => r.id === focusId)?.title ?? focusId ?? '';
    return focusTrend(entries, focusId, title, now);
  }, [entries, now]);
  return (
    <HistoryScreen
      style={useTopInset()}
      trend={trend}
      items={items}
      now={now}
      onOpen={(swing) => navigation.navigate('Result', { entryId: swing.id, fromHistory: true })}
      onSettings={() => navigation.navigate('Settings')}
    />
  );
}

// ── Inställningar ────────────────────────────────────────────────────────────

export function SettingsContainer() {
  const navigation = useNavigation<StackNav>();
  const { settings, updateSettings } = useSettings();
  const { entries } = useHistory();
  const insets = useSafeAreaInsets();
  // Faktiska bytes på disk, som medietaket räknar (mediaStore.measureMedia); mäts om när historiken ändras.
  const usedBytes = useMemo(
    () => entries.reduce((sum, e) => {
      const m = measureMedia(e);
      return sum + m.videoBytes + m.framesBytes;
    }, 0),
    [entries],
  );
  const purgedCount = useMemo(() => entries.filter((e) => e.videoPurged).length, [entries]);
  const onMediaCapChange = useCallback(
    (mediaCapMb: number) => {
      const warning = capChangeWarning(usedBytes, mediaCapMb);
      if (!warning) {
        void updateSettings({ mediaCapMb });
        return;
      }
      // Ett lägre tak raderar mediefiler direkt (appStore.updateSettings) — bekräfta först.
      Alert.alert('Rensa äldre media?', warning, [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Rensa', style: 'destructive', onPress: () => void updateSettings({ mediaCapMb }) },
      ]);
    },
    [usedBytes, updateSettings],
  );
  return (
    <SettingsScreen
      // iOS modal sheet sits below the status bar already; elsewhere it is a full card.
      style={{ paddingTop: Platform.OS === 'ios' ? 0 : insets.top }}
      language={settings.language}
      onLanguageChange={(language) => void updateSettings({ language })}
      level={settings.level}
      onLevelChange={(level) => void updateSettings({ level })}
      defaultAngle={settings.defaultAngle}
      onDefaultAngleChange={(defaultAngle) => void updateSettings({ defaultAngle })}
      mediaCapMb={settings.mediaCapMb}
      onMediaCapChange={onMediaCapChange}
      usedBytes={usedBytes}
      purgedCount={purgedCount}
      onDone={() => navigation.goBack()}
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
  const speech = useSpeech();
  // Leaving the result screen silences "Läs upp" — it is tied to what is on screen.
  // OSÄKER: also stops a live job if one were queued; today the two cannot overlap (Result is
  // not reachable from a running session). Risk: low.
  const { stop } = speech;
  useFocusEffect(useCallback(() => stop, [stop]));
  if (!entry) return <View style={[{ flex: 1, backgroundColor: colors.bg }, top]} />;
  const analysis: SpeechSource = {
    rules: entry.results,
    focus_rule: entry.results.find((r) => r.id === entry.focusRuleId),
    overall_assessment: entry.overallAssessment,
  };
  return (
    <ResultScreen
      style={top}
      title={`${dayLabel(entry.timestamp, now)} ${clock(entry.timestamp)}`}
      backLabel={params.fromHistory ? 'Historik' : 'Tillbaka'}
      onBack={() => navigation.goBack()}
      analysis={analysis}
      ruleInfo={RULE_INFO}
      angle={entry.cameraAngle}
      posterUri={entry.framesPurged ? null : (entry.frameUris[0] ?? null)}
      phase={phase}
      onPhaseChange={setPhase}
      onReadAloud={() =>
        void speech.readAloud(analysis, {
          focusRuleId: entry.focusRuleId,
          ruleTitle: (id) => RULE_INFO[id]?.title,
        })
      }
      onNext={params.fromHistory ? undefined : () => navigation.navigate('Tabs', { screen: 'Swing' })}
    />
  );
}
