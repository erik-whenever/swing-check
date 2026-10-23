import type { CameraAngle } from './lib/cameraAngle';

export interface RuleDrill {
  title: string;
  description: string;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  phase: 'address' | 'backswing' | 'top' | 'downswing' | 'impact' | 'follow';
  weight: 1 | 2 | 3;
  active: boolean;
  /** Camera angles this rule can be verified from. Empty/undefined = any angle. */
  angles?: CameraAngle[];
  libraryId?: string;  // links back to RULE_LIBRARY entry
  drills?: RuleDrill[];
}

export interface RuleResult {
  id: string;
  verdict: 'pass' | 'fail' | 'cannot_determine';
  confidence: number;
  relevant_frames: number[];
  /** Omitted by the lean quick-mode schema — TTS never reads it. */
  visual_evidence?: string;
  /** Omitted by the lean quick-mode schema — TTS never reads it. */
  observation?: string;
  short_verdict?: string;  // <=6 word Swedish summary, used for TTS quick mode
  suggestion?: string;
  correction?: string;
  drill_suggestion?: string;
}

export interface SwingAnalysis {
  camera_angle_detected: 'face-on' | 'down-the-line' | 'unknown';
  frame_quality: 'good' | 'acceptable' | 'poor';
  frame_quality_notes: string;
  usable_phases_detected: string[];
  focus_rule?: RuleResult;
  rules: RuleResult[];
  overall_assessment: string;
  cannot_determine_reasons?: string[];
}

export interface SwingRecord {
  id: string;
  timestamp: number;
  videoBlob: Blob;
  frames: string[];
  results: RuleResult[];
  focusRuleId?: string;
  overallAssessment: string;
  /** Camera angle selected when this swing was analyzed. */
  cameraAngle?: CameraAngle;
  /** Groups swings recorded within the same hands-free session. */
  sessionId?: string;
}

export const PHASES = [
  'address',
  'backswing',
  'top',
  'downswing',
  'impact',
  'follow',
] as const;
