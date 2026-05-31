import type { RuleResult } from '../../types';
import { useRulesStore } from '../../store/rules';
import { mapDetectedAngle, ANGLE_LABEL } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';

const verdictStyles = {
  pass: { bg: 'bg-green-900/50', border: 'border-green-700', text: 'text-green-300', label: 'PASS' },
  fail: { bg: 'bg-red-900/50', border: 'border-red-700', text: 'text-red-300', label: 'FAIL' },
  cannot_determine: {
    bg: 'bg-yellow-900/50',
    border: 'border-yellow-700',
    text: 'text-yellow-300',
    label: 'N/A',
  },
};

interface Props {
  result: RuleResult;
  isFocus?: boolean;
  detectedAngle?: 'face-on' | 'down-the-line' | 'unknown';
}

export function RuleResultCard({ result, isFocus, detectedAngle }: Props) {
  const rules = useRulesStore((s) => s.rules);
  const rule = rules.find((r) => r.id === result.id);
  const style = verdictStyles[result.verdict];

  // A cannot_determine on an angle-specific rule, where the footage isn't from that
  // angle, gets a precise "Requires X angle" message instead of the generic one.
  const requiredAngles: CameraAngle[] = rule?.angles ?? [];
  const detected = mapDetectedAngle(detectedAngle);
  const wrongAngle =
    result.verdict === 'cannot_determine' &&
    requiredAngles.length === 1 &&
    (detected === null || !requiredAngles.includes(detected));
  const requiredLabel = wrongAngle ? ANGLE_LABEL[requiredAngles[0]] : null;

  return (
    <div
      className={`p-3 rounded-lg border ${style.bg} ${style.border} ${
        isFocus ? 'ring-1 ring-accent-hover' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium truncate">
          {rule?.title || result.id}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted">
            {Math.round(result.confidence * 100)}%
          </span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${style.text} ${style.bg}`}
          >
            {style.label}
          </span>
        </div>
      </div>

      {wrongAngle ? (
        <p className="text-xs text-amber-300 font-medium flex items-center gap-1">
          <span>⚠</span> Requires {requiredLabel} angle
        </p>
      ) : (
        <>
          <p className="text-xs text-fg-dim mb-1">{result.visual_evidence}</p>
          <p className="text-xs text-muted">{result.observation}</p>
        </>
      )}

      {result.suggestion && (
        <p className="text-xs text-accent-text mt-2">
          Tip: {result.suggestion}
        </p>
      )}
      {result.correction && (
        <p className="text-xs text-amber-400 mt-2">
          Correction: {result.correction}
        </p>
      )}
      {result.drill_suggestion && (
        <p className="text-xs text-blue-400 mt-2">
          Drill: {result.drill_suggestion}
        </p>
      )}
    </div>
  );
}
