import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useSessionStore, selectPrimarySwing } from '../../store/session';
import { useRulesStore } from '../../store/rules';
import { useSettingsStore } from '../../store/settings';
import { useHistory } from '../../hooks/useHistory';
import { analyzeSwing } from '../../lib/api';
import {
  buildSpeechParts,
  cancelSpeech,
  speak,
  speakSequence,
  TTS_FAILED,
  TTS_SESSION_NEXT,
} from '../../lib/tts';

/** Delay after feedback before the next swing auto-records in a session. */
const SESSION_RESTART_MS = 3000;
import { RuleResultRow } from './RuleResult';
import { FrameViewer } from './FrameViewer';
import { ShareButton } from './ShareButton';
import { AnglePill } from '../AngleToggle';
import { ruleMatchesAngle, ANGLE_TO_PROMPT } from '../../lib/cameraAngle';
import { createLogger } from '../../lib/logger';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { Button, Card, Chip } from '../ui';

const log = createLogger('AnalysisView');

export function AnalysisView() {
  const t = useT();
  // Single-swing view: renders swings[0]. A session holding N swings gets its own
  // view in D-5 pass 2; the state layer below is already per swing (ADR-003 §5.4).
  const swing = useSessionStore(selectPrimarySwing);
  const currentVideoBlob = useSessionStore((s) => s.currentVideoBlob);
  const updateSwing = useSessionStore((s) => s.updateSwing);
  const clearSwings = useSessionStore((s) => s.clearSwings);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setView = useSessionStore((s) => s.setView);
  const analysisAngle = useSessionStore((s) => s.analysisAngle);
  const setAnalysisAngle = useSessionStore((s) => s.setAnalysisAngle);
  const sessionActive = useSessionStore((s) => s.sessionActive);
  const sessionId = useSessionStore((s) => s.sessionId);
  const swingNumber = useSessionStore((s) => s.swingNumber);
  const requestAutoRecord = useSessionStore((s) => s.requestAutoRecord);
  const endSession = useSessionStore((s) => s.endSession);

  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // After feedback finishes, return to the camera and auto-record the next swing —
  // unless the session was ended in the meantime.
  const scheduleSessionRestart = useCallback(() => {
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!useSessionStore.getState().sessionActive) return;
      clearSwings();
      requestAutoRecord();
      setView('camera');
    }, SESSION_RESTART_MS);
  }, [clearRestartTimer, requestAutoRecord, clearSwings, setView]);

  const rules = useRulesStore((s) => s.rules);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsMode = useSettingsStore((s) => s.ttsMode);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  // Only rules active AND verifiable from the current angle are sent to Claude.
  const activeRules = rules.filter(
    (r) => r.active && ruleMatchesAngle(r, cameraAngle),
  );
  const { saveRecord } = useHistory();
  const [speaking, setSpeaking] = useState(false);

  const swingId = swing?.id ?? null;
  const frames = swing?.frames ?? [];
  const analysis = swing?.analysis ?? null;
  const status = swing?.status ?? null;
  const error = swing?.status === 'failed' ? swing.error : null;

  useEffect(() => {
    // Re-reading from the store rather than closing over `swing` keeps this effect
    // keyed on the swing's IDENTITY: the status/analysis patches it writes below
    // replace the object but not the id, so it never re-triggers itself.
    const current = useSessionStore.getState().swings.find((w) => w.id === swingId);
    if (!current || !swingId) return;
    if (current.frames.length === 0 || activeRules.length === 0) return;
    if (current.analysis || current.status === 'failed') return;
    // A swing captured by the SESSION path owns its own analysis (D-5 pass 3):
    // `timings` is only ever set there. Without this, opening the analysis view
    // while such a swing is mid-flight would fire a second, paid Vision call for
    // the same swing.
    if (current.timings) return;

    const swingFrames = current.frames;
    let cancelled = false;

    async function run() {
      updateSwing(swingId!, { status: 'analyzing', error: null });
      setAnalysisAngle(cameraAngle);
      const startedAt = performance.now();
      log.info('Lifecycle: sending', {
        frames: swingFrames.length,
        activeRules: activeRules.length,
        cameraAngle,
        focusRuleId: focusRuleId ?? null,
      });
      try {
        const analysis = await analyzeSwing(swingFrames, activeRules, {
          focusRuleId: focusRuleId ?? undefined,
          cameraAngle: ANGLE_TO_PROMPT[cameraAngle],
          quickMode: ttsEnabled && ttsMode === 'quick',
        });
        const receivedMs = Math.round(performance.now() - startedAt);
        log.info('Lifecycle: received', { phaseMs: receivedMs });
        if (cancelled) return;
        updateSwing(swingId!, { analysis, status: 'done' });

        const inSession = sessionActive;
        if (ttsEnabled) {
          const parts = buildSpeechParts(analysis, ttsMode, focusRuleId, {
            swingNumber: inSession ? swingNumber : undefined,
          });
          if (inSession) parts.push(TTS_SESSION_NEXT);
          speakSequence(parts, {
            onStart: () => setSpeaking(true),
            onEnd: () => {
              setSpeaking(false);
              if (inSession) scheduleSessionRestart();
            },
          });
        } else if (inSession) {
          // No voice — still loop to the next swing after the standard delay.
          scheduleSessionRestart();
        }

        if (currentVideoBlob) {
          await saveRecord({
            id: uuid(),
            timestamp: Date.now(),
            videoBlob: currentVideoBlob,
            frames: swingFrames,
            results: [
              ...(analysis.focus_rule ? [analysis.focus_rule] : []),
              ...analysis.rules,
            ],
            focusRuleId: focusRuleId ?? undefined,
            overallAssessment: analysis.overall_assessment,
            cameraAngle,
            sessionId: sessionId ?? undefined,
          });
        }
        log.info('Lifecycle: rendered', {
          totalMs: Math.round(performance.now() - startedAt),
          saved: !!currentVideoBlob,
        });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Analysis failed';
          log.error('Lifecycle: failed', {
            error: msg,
            elapsedMs: Math.round(performance.now() - startedAt),
          });
          updateSwing(swingId!, { status: 'failed', error: msg });
          if (ttsEnabled) speak(TTS_FAILED);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // `frames.length` is in the deps because a swing can reach this view while
    // still `extracting` (empty frames): the effect bails, then re-fires once the
    // frames land. Without it that swing would sit on the spinner forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swingId, frames.length]);

  // Stop any in-flight speech and pending auto-restart when leaving the analysis view.
  useEffect(() => {
    return () => {
      cancelSpeech();
      clearRestartTimer();
    };
  }, [clearRestartTimer]);

  const stopSpeaking = () => {
    cancelSpeech();
    setSpeaking(false);
  };

  if (activeRules.length === 0) {
    return (
      <EmptyState
        message={t('analysis.noRules')}
        action={t('analysis.toRules')}
        onAction={() => setView('rules')}
      />
    );
  }

  if (status === 'extracting' || status === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-10 h-10 border-[3px] border-accent border-t-transparent rounded-full animate-spin mb-5" />
        <p className="text-sm font-medium text-fg">{t('analysis.working')}</p>
        <p className="mt-1 text-xs text-muted">
          {t('analysis.workingSub', { count: frames.length })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title={t('analysis.failed')}
        message={error}
        action={t('analysis.retry')}
        onAction={() => {
          clearSwings();
          setView('camera');
        }}
      />
    );
  }

  if (!analysis) {
    return (
      <EmptyState
        message={t('analysis.empty')}
        action={t('analysis.toCamera')}
        onAction={() => setView('camera')}
      />
    );
  }

  const { focus_rule, rules: ruleResults, overall_assessment, frame_quality, cannot_determine_reasons } =
    analysis;

  // The focus rule LEADS the list rather than sitting in a section of its own: it is
  // the same kind of thing as the rest, just the one that matters today.
  const allResults = focus_rule ? [focus_rule, ...ruleResults] : ruleResults;
  const passed = allResults.filter((r) => r.verdict === 'pass').length;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-[18px] pt-1 pb-6 space-y-3">
        {/* Frame quality is a caveat on every verdict below it, so it belongs next to
            the title rather than buried in a row of metadata. */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('analysis.title')}</h2>
          <Chip tone={QUALITY_TONE[frame_quality] ?? 'neutral'}>
            {t(`analysis.quality.${frame_quality}` as TranslationKey)}
          </Chip>
        </div>

        {/* Session control: swing counter + end button (auto-restart loop is running) */}
        {sessionActive && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-card bg-accent-tint">
            <span className="text-xs font-semibold text-accent-text">
              🎯 {t('analysis.session', { n: swingNumber })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                clearRestartTimer();
                cancelSpeech();
                endSession();
              }}
            >
              {t('camera.sessionEnd')}
            </Button>
          </div>
        )}

        {speaking && (
          <Button variant="secondary" full onClick={stopSpeaking}>
            ⏹ {t('analysis.stopSpeech')}
          </Button>
        )}

        <FrameViewer frames={frames} />

        {/* Overall assessment. The gold eyebrow carries the score, so the number and
            the sentence explaining it are read as one thing. */}
        <Card>
          <p className="eyebrow text-gold mb-1.5">
            {t('analysis.overall')} ·{' '}
            {t('analysis.passOf', { pass: passed, total: allResults.length })}
          </p>
          <p className="text-xs leading-[1.55] text-fg-dim">{overall_assessment}</p>
        </Card>

        {/* One card, one row per rule — see RuleResultRow for why. */}
        <Card padded={false} className="overflow-hidden divide-y divide-line">
          {allResults.map((result) => (
            <RuleResultRow
              key={result.id}
              result={result}
              isFocus={!!focus_rule && result.id === focus_rule.id}
              detectedAngle={analysis.camera_angle_detected}
            />
          ))}
        </Card>

        {cannot_determine_reasons && cannot_determine_reasons.length > 0 && (
          <div className="px-1">
            <p className="eyebrow text-muted mb-1">{t('analysis.cannotDetermine')}</p>
            <ul className="space-y-0.5 text-[11px] leading-[1.5] text-faint">
              {cannot_determine_reasons.map((reason, i) => (
                <li key={i}>· {reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Which angle this verdict is valid for. Secondary, so it sits at the end. */}
        <div className="flex items-center gap-1.5 flex-wrap px-1 text-[10.5px] text-muted">
          {analysisAngle && (
            <>
              {t('analysis.analyzedAs')} <AnglePill angle={analysisAngle} className="!bg-raised" />
            </>
          )}
          <span className="text-faint">
            · {t('analysis.detected', { angle: analysis.camera_angle_detected })}
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          <div className="flex-1">
            <ShareButton />
          </div>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              clearSwings();
              setView('camera');
            }}
          >
            {t('analysis.newSwing')}
          </Button>
        </div>
      </div>
    </div>
  );
}

const QUALITY_TONE: Record<string, 'ok' | 'gold' | 'bad'> = {
  good: 'ok',
  acceptable: 'gold',
  poor: 'bad',
};

function EmptyState({
  title,
  message,
  action,
  onAction,
}: {
  title?: string;
  message: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-10 text-center">
      {title && <p className="mb-1.5 text-sm font-semibold text-bad">{title}</p>}
      <p className="mb-5 text-sm leading-relaxed text-muted">{message}</p>
      <Button onClick={onAction}>{action}</Button>
    </div>
  );
}
