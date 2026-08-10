import { useState } from 'react';
import type { RuleResult } from '../../types';
import { useRulesStore } from '../../store/rules';
import { mapDetectedAngle, ANGLE_LABEL } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';
import { useT } from '../../lib/i18n';
import { VerdictDot } from '../ui';

interface Props {
  result: RuleResult;
  isFocus?: boolean;
  detectedAngle?: 'face-on' | 'down-the-line' | 'unknown';
}

/**
 * One rule as a row in the verdict list.
 *
 * This used to be a full tinted card per rule, which made a four-rule analysis four
 * competing colour blocks with no scannable answer to "what failed?". The row now
 * carries only the verdict and the name; everything the model said unfolds on tap,
 * so the detail is one gesture away instead of permanently in the way.
 */
export function RuleResultRow({ result, isFocus, detectedAngle }: Props) {
  const t = useT();
  const rules = useRulesStore((s) => s.rules);
  const rule = rules.find((r) => r.id === result.id);
  // Failures are the reason this screen exists — those start open.
  const [open, setOpen] = useState(result.verdict === 'fail');

  // A cannot_determine on an angle-specific rule, where the footage isn't from that
  // angle, gets a precise "Requires X angle" message instead of the generic one.
  const requiredAngles: CameraAngle[] = rule?.angles ?? [];
  const detected = mapDetectedAngle(detectedAngle);
  const wrongAngle =
    result.verdict === 'cannot_determine' &&
    requiredAngles.length === 1 &&
    (detected === null || !requiredAngles.includes(detected));

  // Quick mode omits visual_evidence/observation; short_verdict is then all the
  // model returned, so show that rather than two empty rows.
  const details = [
    result.visual_evidence,
    result.observation,
    !result.visual_evidence && !result.observation ? result.short_verdict : null,
  ].filter(Boolean) as string[];

  const hasDetail =
    wrongAngle ||
    details.length > 0 ||
    !!result.suggestion ||
    !!result.correction ||
    !!result.drill_suggestion;

  return (
    <div className={isFocus ? 'bg-gold-tint/40' : ''}>
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        aria-expanded={hasDetail ? open : undefined}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <VerdictDot verdict={result.verdict} />
        <span className={`flex-1 text-xs leading-snug ${isFocus ? 'font-semibold' : 'font-medium'}`}>
          {rule?.title || result.id}
        </span>
        {isFocus && (
          <span className="text-[9px] font-bold tracking-[0.06em] text-gold">
            {t('analysis.focus').toUpperCase()}
          </span>
        )}
        {hasDetail && (
          <span
            className={`text-faint text-[10px] leading-none transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          >
            ▾
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div className="px-3.5 pb-3 pl-[42px] space-y-1.5">
          {wrongAngle ? (
            <p className="text-[11px] font-medium text-gold">
              ⚠ {t('analysis.requiresAngle', { angle: ANGLE_LABEL[requiredAngles[0]] })}
            </p>
          ) : (
            details.map((d, i) => (
              <p
                key={i}
                className={`text-[11px] leading-[1.45] ${i === 0 ? 'text-fg-dim' : 'text-muted'}`}
              >
                {d}
              </p>
            ))
          )}

          {result.suggestion && (
            <p className="text-[11px] leading-[1.45] text-accent-text">
              {t('analysis.tip')}: {result.suggestion}
            </p>
          )}
          {result.correction && (
            <p className="text-[11px] leading-[1.45] text-gold">
              {t('analysis.correction')}: {result.correction}
            </p>
          )}
          {result.drill_suggestion && (
            <p className="text-[11px] leading-[1.45] text-muted">
              {t('analysis.drill')}: {result.drill_suggestion}
            </p>
          )}
          <p className="pt-0.5 text-[10px] text-faint tabular-nums">
            {Math.round(result.confidence * 100)} %
          </p>
        </div>
      )}
    </div>
  );
}
