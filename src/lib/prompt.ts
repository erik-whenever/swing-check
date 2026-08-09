import type { Rule } from '../types';

export const SYSTEM_PROMPT = `You are a golf swing analysis assistant. You analyze sequences of video frames showing a golfer's swing and evaluate specific coaching rules provided by the user.

CRITICAL INSTRUCTIONS FOR ACCURACY:

1. EVIDENCE FIRST: For each rule, you must first describe exactly what you can observe in the frames before making any judgment. Never state a verdict without visual evidence.

2. USE "cannot_determine" LIBERALLY: Choose this verdict whenever:
   - The relevant body part is outside the frame
   - Image quality or lighting prevents clear observation (for camera angle, see point 4)
   - The specific frame capturing the relevant moment is missing
   - You feel uncertain (confidence would be below 0.6)

3. CONFIDENCE IS HONEST: A confidence of 1.0 means you can see clear, unambiguous evidence. A confidence of 0.7 means you can see something but it's partially obscured or ambiguous. Never inflate confidence.

4. CAMERA ANGLE IS THE USER'S CALL: When the user prompt states a CAMERA ANGLE other than "unknown", that value is the user's own choice of how the swing was filmed and MUST be treated as correct. Never dismiss a rule, and never answer "cannot_determine", on the grounds that the camera angle is wrong or unsuitable when an angle has been given — analyze the rule from the angle you were told you are looking at. If the frames clearly contradict the stated angle, still analyze as far as the frames allow and report the discrepancy through camera_angle_detected and frame_quality_notes, never through cannot_determine. Only when CAMERA ANGLE is "unknown" should you determine the angle yourself; state it in camera_angle_detected either way.

5. NEVER INFER WHAT YOU CANNOT SEE: If hands are behind the body, you cannot assess hand position. Say so explicitly.

6. DRILL SUGGESTIONS: When a rule has predefined drills provided, reference and recommend those drills on failure rather than inventing new ones. You may expand on the drill with additional tips.

7. LANGUAGE — SWEDISH PROSE: Every free-text field must be written in Swedish: visual_evidence, observation, suggestion, correction, drill_suggestion, overall_assessment, frame_quality_notes and every entry in cannot_determine_reasons. JSON keys and enum values stay in English exactly as the schema specifies ("pass", "fail", "cannot_determine", "face-on", "down-the-line", "unknown", "good", "acceptable", "poor", and the phase names). Rule ids are copied verbatim.

Respond ONLY with valid JSON matching the schema provided. No prose before or after.`;

interface SwingPromptOptions {
  rules: Rule[];
  focusRuleId?: string | null;
  frameCount: number;
  cameraAngle?: 'face-on' | 'down-the-line' | 'unknown';
  quickMode?: boolean;
}

const SHORT_VERDICT_INSTRUCTION =
  'Also return a short_verdict field: maximum 6 words summarizing the verdict in Swedish, e.g. Händerna för lågt i toppen or Bra axelrotation';

function formatDrills(rule: Rule): string {
  if (!rule.drills || rule.drills.length === 0) return '';
  const drillLines = rule.drills
    .map((d) => `     - "${d.title}": ${d.description}`)
    .join('\n');
  return `\n   Predefined drills (use these on fail):\n${drillLines}`;
}

export function buildSwingPrompt(options: SwingPromptOptions): string {
  const { rules, focusRuleId, frameCount, cameraAngle = 'unknown', quickMode = false } = options;

  const focusRule = rules.find((r) => r.id === focusRuleId);
  const standardRules = rules.filter((r) => r.id !== focusRuleId);

  const shortVerdictLine = quickMode ? `\n   ${SHORT_VERDICT_INSTRUCTION}` : '';

  // An explicit angle comes from the user's own selection in the UI, so it is stated
  // as authoritative. "unknown" carries no such claim — the model decides.
  const cameraAngleLine =
    cameraAngle === 'unknown'
      ? 'CAMERA ANGLE: unknown'
      : `CAMERA ANGLE (user-selected, treat as authoritative): ${cameraAngle}`;

  return `You are analyzing ${frameCount} sequential frames from a golf swing video.

${cameraAngleLine}
FRAMES: The images are ordered chronologically from address to follow-through.

${
  focusRule
    ? `
━━━ FOCUS RULE (analyze in depth) ━━━
Rule ID: ${focusRule.id}
Title: ${focusRule.title}
What to check: ${focusRule.description}
Phase: ${focusRule.phase}
${formatDrills(focusRule)}

For this rule specifically:
- Describe frame-by-frame what you observe during the ${focusRule.phase} phase
- Note the exact frame number(s) most relevant to this rule
- If verdict is "fail", recommend the predefined drills above (if any) and add specific corrections${shortVerdictLine}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    : ''
}

STANDARD RULES TO EVALUATE:
${standardRules
  .map(
    (rule, i) => `
${i + 1}. [ID: ${rule.id}] ${rule.title} (phase: ${rule.phase})
   Check: ${rule.description}${formatDrills(rule)}${shortVerdictLine}
`
  )
  .join('')}

REQUIRED JSON RESPONSE FORMAT:
{
  "camera_angle_detected": "face-on" | "down-the-line" | "unknown",
  "frame_quality": "good" | "acceptable" | "poor",
  "frame_quality_notes": "string",
  "usable_phases_detected": ["address", "backswing", ...],

  ${
    focusRule
      ? `"focus_rule": {
    "id": "${focusRule.id}",
    "verdict": "pass" | "fail" | "cannot_determine",
    "confidence": 0.0-1.0,
    "relevant_frames": [1, 3],
    "visual_evidence": "Describe exactly what you see in those frames",
    "observation": "Your interpretation",${quickMode ? '\n    "short_verdict": "<=6 word Swedish summary",' : ''}
    "correction": "Specific correction if fail, null otherwise",
    "drill_suggestion": "Recommend predefined drill if available, otherwise suggest one. Null if pass or cannot_determine"
  },`
      : ''
  }

  "rules": [
    {
      "id": "rule-id",
      "verdict": "pass" | "fail" | "cannot_determine",
      "confidence": 0.0-1.0,
      "relevant_frames": [2, 3],
      "visual_evidence": "I can see in frame 2 that...",
      "observation": "The hands appear to be...",${quickMode ? '\n      "short_verdict": "<=6 word Swedish summary",' : ''}
      "suggestion": "Recommend predefined drill if available, otherwise suggest a correction"
    }
  ],

  "overall_assessment": "2-3 sentence summary",
  "cannot_determine_reasons": ["frame 4 is too dark to assess impact position"]
}

CONFIDENCE CALIBRATION:
- 0.9–1.0: Clear, unambiguous visual evidence, well-lit, correct angle
- 0.7–0.89: Visible but partially occluded or slight angle ambiguity
- 0.5–0.69: Inferring from adjacent frames — consider cannot_determine instead
- Below 0.5: Use cannot_determine

"cannot_determine" is a valid and preferred answer over a low-confidence guess.`;
}
