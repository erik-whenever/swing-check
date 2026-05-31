import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useSessionStore } from '../../store/session';
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
} from '../../lib/tts';
import { RuleResultCard } from './RuleResult';
import { FrameViewer } from './FrameViewer';
import { AnglePill } from '../AngleToggle';
import { ruleMatchesAngle, ANGLE_TO_PROMPT } from '../../lib/cameraAngle';
import { createLogger } from '../../lib/logger';

const log = createLogger('AnalysisView');

export function AnalysisView() {
  const currentFrames = useSessionStore((s) => s.currentFrames);
  const currentVideoBlob = useSessionStore((s) => s.currentVideoBlob);
  const currentAnalysis = useSessionStore((s) => s.currentAnalysis);
  const setCurrentAnalysis = useSessionStore((s) => s.setCurrentAnalysis);
  const isAnalyzing = useSessionStore((s) => s.isAnalyzing);
  const setIsAnalyzing = useSessionStore((s) => s.setIsAnalyzing);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setView = useSessionStore((s) => s.setView);
  const analysisAngle = useSessionStore((s) => s.analysisAngle);
  const setAnalysisAngle = useSessionStore((s) => s.setAnalysisAngle);

  const rules = useRulesStore((s) => s.rules);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsMode = useSettingsStore((s) => s.ttsMode);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  // Only rules active AND verifiable from the current angle are sent to Claude.
  const activeRules = rules.filter(
    (r) => r.active && ruleMatchesAngle(r, cameraAngle),
  );
  const { saveRecord } = useHistory();
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (currentFrames.length === 0 || activeRules.length === 0 || currentAnalysis) return;

    let cancelled = false;
    setError(null);

    async function run() {
      setIsAnalyzing(true);
      setAnalysisAngle(cameraAngle);
      const startedAt = performance.now();
      log.info('Lifecycle: sending', {
        frames: currentFrames.length,
        activeRules: activeRules.length,
        cameraAngle,
        focusRuleId: focusRuleId ?? null,
      });
      try {
        const analysis = await analyzeSwing(currentFrames, activeRules, {
          focusRuleId: focusRuleId ?? undefined,
          cameraAngle: ANGLE_TO_PROMPT[cameraAngle],
          quickMode: ttsEnabled && ttsMode === 'quick',
        });
        const receivedMs = Math.round(performance.now() - startedAt);
        log.info('Lifecycle: received', { phaseMs: receivedMs });
        if (cancelled) return;
        setCurrentAnalysis(analysis);

        if (ttsEnabled) {
          speakSequence(buildSpeechParts(analysis, ttsMode, focusRuleId), {
            onStart: () => setSpeaking(true),
            onEnd: () => setSpeaking(false),
          });
        }

        if (currentVideoBlob) {
          await saveRecord({
            id: uuid(),
            timestamp: Date.now(),
            videoBlob: currentVideoBlob,
            frames: currentFrames,
            results: [
              ...(analysis.focus_rule ? [analysis.focus_rule] : []),
              ...analysis.rules,
            ],
            focusRuleId: focusRuleId ?? undefined,
            overallAssessment: analysis.overall_assessment,
            cameraAngle,
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
          setError(msg);
          if (ttsEnabled) speak(TTS_FAILED);
        }
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrames]);

  // Stop any in-flight speech when leaving the analysis view.
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  const stopSpeaking = () => {
    cancelSpeech();
    setSpeaking(false);
  };

  if (activeRules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-slate-400 mb-4">
          No active rules. Add rules before analyzing.
        </p>
        <button
          onClick={() => setView('rules')}
          className="px-4 py-2 bg-emerald-700 rounded-lg text-sm"
        >
          Go to Rules
        </button>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-10 h-10 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Analyzing your swing...</p>
        <p className="text-xs text-slate-500 mt-1">
          {currentFrames.length} frames sent to Claude Vision
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-red-400 mb-2">Analysis failed</p>
        <p className="text-sm text-slate-400 mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setCurrentAnalysis(null);
            setView('camera');
          }}
          className="px-4 py-2 bg-emerald-700 rounded-lg text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!currentAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-slate-400">No analysis yet. Record a swing first.</p>
        <button
          onClick={() => setView('camera')}
          className="mt-4 px-4 py-2 bg-emerald-700 rounded-lg text-sm"
        >
          Go to Camera
        </button>
      </div>
    );
  }

  const { focus_rule, rules: ruleResults, overall_assessment, frame_quality, cannot_determine_reasons } =
    currentAnalysis;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Stop speech */}
        {speaking && (
          <button
            onClick={stopSpeaking}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm
                       font-medium transition-colors flex items-center justify-center gap-2"
          >
            ⏹ Stoppa uppläsning
          </button>
        )}

        {/* Frame viewer */}
        <FrameViewer frames={currentFrames} />

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
            <span className="flex items-center gap-1 text-xs text-slate-400">
              Analyzed as <AnglePill angle={analysisAngle} />
            </span>
          )}
          <span className="text-xs text-slate-500">
            detected: {currentAnalysis.camera_angle_detected}
          </span>
        </div>

        {/* Overall assessment */}
        <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-sm">{overall_assessment}</p>
        </div>

        {/* Focus rule result */}
        {focus_rule && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-emerald-400 mb-2 font-semibold">
              Focus Rule
            </h3>
            <RuleResultCard
              result={focus_rule}
              isFocus
              detectedAngle={currentAnalysis.camera_angle_detected}
            />
          </div>
        )}

        {/* Standard rule results */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2 font-semibold">
            Rules
          </h3>
          <div className="space-y-2">
            {ruleResults.map((result) => (
              <RuleResultCard
                key={result.id}
                result={result}
                detectedAngle={currentAnalysis.camera_angle_detected}
              />
            ))}
          </div>
        </div>

        {/* Cannot determine reasons */}
        {cannot_determine_reasons && cannot_determine_reasons.length > 0 && (
          <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <h4 className="text-xs font-medium text-slate-400 mb-1">
              Could not determine
            </h4>
            <ul className="text-xs text-slate-500 space-y-1">
              {cannot_determine_reasons.map((reason, i) => (
                <li key={i}>- {reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* New swing button */}
        <button
          onClick={() => {
            setCurrentAnalysis(null);
            setView('camera');
          }}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium transition-colors"
        >
          Record New Swing
        </button>
      </div>
    </div>
  );
}
