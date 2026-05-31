/** The two camera angles a swing can be filmed from. */
export type CameraAngle = 'dtl' | 'face-on';

export const CAMERA_ANGLES: CameraAngle[] = ['dtl', 'face-on'];

/** Short label used in pills/toggles. */
export const ANGLE_LABEL: Record<CameraAngle, string> = {
  dtl: 'DTL',
  'face-on': 'Face-on',
};

/** The vocabulary the Claude prompt / analysis uses for angle. */
export const ANGLE_TO_PROMPT: Record<CameraAngle, 'face-on' | 'down-the-line'> = {
  dtl: 'down-the-line',
  'face-on': 'face-on',
};

/** Map an angle Claude reports back in the analysis to our internal angle. */
export function mapDetectedAngle(
  detected: 'face-on' | 'down-the-line' | 'unknown' | undefined,
): CameraAngle | null {
  if (detected === 'down-the-line') return 'dtl';
  if (detected === 'face-on') return 'face-on';
  return null;
}

/**
 * Does a rule apply to the given camera angle? A rule with no `angles` (or an empty
 * list) is considered angle-agnostic and applies to every angle — this keeps older
 * custom rules working and lets users author rules that hold from either view.
 */
export function ruleMatchesAngle(
  rule: { angles?: CameraAngle[] },
  angle: CameraAngle,
): boolean {
  if (!rule.angles || rule.angles.length === 0) return true;
  return rule.angles.includes(angle);
}
