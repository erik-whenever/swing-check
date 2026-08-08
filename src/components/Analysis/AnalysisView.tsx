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
import { RuleResultCard } from './RuleResult';
import { FrameViewer } from './FrameViewer';
import { ShareButton } from './ShareButton';
import { AnglePill } from '../AngleToggle';
import { ruleMatchesAngle, ANGLE_TO_PROMPT } from '../../lib/cameraAngle';
import { createLogger } from '../../lib/logger';

const log = createLogger('AnalysisView');

export function AnalysisView() {
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
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-muted mb-4">
          No active rules. Add rules before analyzing.
        </p>
        <button
          onClick={() => setView('rules')}
          className="px-4 py-2 bg-accent-press rounded-lg text-sm"
        >
          Go to Rules
        </button>
      </div>
    );
  }

  if (status === 'extracting' || status === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-10 h-10 border-4 border-accent-press border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted">Analyzing your swing...</p>
        <p className="text-xs text-faint mt-1">
          {frames.length} frames sent to Claude Vision
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-red-400 mb-2">Analysis failed</p>
        <p className="text-sm text-muted mb-4">{error}</p>
        <button
          onClick={() => {
            clearSwings();
            setView('camera');
          }}
          className="px-4 py-2 bg-accent-press rounded-lg text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-muted">No analysis yet. Record a swing first.</p>
        <button
          onClick={() => setView('camera')}
          className="mt-4 px-4 py-2 bg-accent-press rounded-lg text-sm"
        >
          Go to Camera
        </button>
      </div>
    );
  }

  const { focus_rule, rules: ruleResults, overall_assessment, frame_quality, cannot_determine_reasons } =
    analysis;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Session control: swing counter + end button (auto-restart loop is running) */}
        {sessionActive && (
          <div className="flex items-center justify-between gap-3 p-3 bg-accent/10 border border-accent/40 rounded-lg">
            <span className="text-sm font-semibold text-accent-text">
              🎯 Session · Sving {swingNumber}
            </span>
            <button
              onClick={() => {
                clearRestartTimer();
                cancelSpeech();
                endSession();
              }}
              className="px-3 py-1.5 rounded-md bg-raised hover:bg-raised-hi text-xs font-semibold transition-colors"
            >
              Avsluta session
            </button>
          </div>
        )}

        {/* Stop speech */}
        {speaking && (
          <button
            onClick={stopSpeaking}
            className="w-full py-2.5 bg-raised hover:bg-raised-hi rounded-lg text-sm
                       font-medium transition-colors flex items-center justify-center gap-2"
          >
            ⏹ Stoppa uppläsning
          </button>
        )}

        {/* Frame viewer */}
        <FrameViewer frames={frames} />

        {/* Quality badge + the angle this swing was analyzed with */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              frame_quality === 'good'
                ? 'bg-green-900 text-green-300'
                : frame_quality === 'acceptable'
                  ? 'bg-yellow-900 text-yellow-300'
                  : 'bg-red-900 text-red-300'
            }`}
          >
            {frame_quality} quality
          </span>
          {analysisAngle && (
            <span className="flex items-center gap-1 text-xs text-muted">
              Analyzed as <AnglePill angle={analysisAngle} />
            </span>
          )}
          <span className="text-xs text-faint">
            detected: {analysis.camera_angle_detected}
          </span>
        </div>

        {/* Overall assessment */}
        <div className="p-3 bg-surface rounded-lg border border-line">
          <p className="text-sm">{overall_assessment}</p>
        </div>

        {/* Focus rule result */}
        {focus_rule && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-accent-text mb-2 font-semibold">
              Focus Rule
            </h3>
            <RuleResultCard
              result={focus_rule}
              isFocus
              detectedAngle={analysis.camera_angle_detected}
            />
          </div>
        )}

        {/* Standard rule results */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-faint mb-2 font-semibold">
            Rules
          </h3>
          <div className="space-y-2">
            {ruleResults.map((result) => (
              <RuleResultCard
                key={result.id}
                result={result}
                detectedAngle={analysis.camera_angle_detected}
              />
            ))}
          </div>
        </div>

        {/* Cannot determine reasons */}
        {cannot_determine_reasons && cannot_determine_reasons.length > 0 && (
          <div className="p-3 bg-surface/50 rounded-lg border border-line/50">
            <h4 className="text-xs font-medium text-muted mb-1">
              Could not determine
            </h4>
            <ul className="text-xs text-faint space-y-1">
              {cannot_determine_reasons.map((reason, i) => (
                <li key={i}>- {reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Share the swing as a clip with feedback overlay */}
        <ShareButton />

        {/* New swing button */}
        <button
          onClick={() => {
            clearSwings();
            setView('camera');
          }}
          className="w-full py-3 bg-accent-press hover:bg-accent rounded-lg text-sm font-medium transition-colors"
        >
          Record New Swing
        </button>
      </div>
    </div>
  );
}
