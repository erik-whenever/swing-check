// Pure model for the app's user settings (N-3.6). No expo imports, so it is unit-tested
// from the repo root's vitest. appStore.ts reads and writes the JSON file around it.

import { DEFAULT_ANALYSIS_LANGUAGE, type AnalysisLanguage } from '@swingcheck/core/lib/language';
import { DEFAULT_MEDIA_CAP_MB } from '@swingcheck/core/lib/mediaRetention';
import type { PlayerLevel } from '@swingcheck/core/lib/recommendRules';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';

/** Recommended set from recommendRules (F-1), or the user's own pick from the library. */
export type RuleMode = 'recommended' | 'custom';

export interface AppSettings {
  /** Bumped only on an incompatible change; an unknown version loads as defaults. */
  version: 1;
  language: AnalysisLanguage;
  /** Storage cap for swing media (N-3.5). Results are never counted or dropped. */
  mediaCapMb: number;
  level: PlayerLevel;
  defaultAngle: CameraAngle;
  ruleMode: RuleMode;
  /** Library ids in the user's order. Kept in 'recommended' mode so switching back restores them. */
  customRuleIds: string[];
}

// OSÄKER: slider bounds are a product guess (50 MB ≈ a few slow-mo clips; 4 GB is far above
// what a phone should give a range app). Risk: low — only the slider range.
export const MEDIA_CAP_MIN_MB = 50;
export const MEDIA_CAP_MAX_MB = 4000;
export const MEDIA_CAP_STEP_MB = 50;

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    language: DEFAULT_ANALYSIS_LANGUAGE,
    mediaCapMb: DEFAULT_MEDIA_CAP_MB,
    level: 'beginner',
    defaultAngle: 'dtl',
    ruleMode: 'recommended',
    customRuleIds: [],
  };
}

const LANGUAGES: readonly AnalysisLanguage[] = ['sv', 'en'];
const LEVELS: readonly PlayerLevel[] = ['beginner', 'intermediate', 'advanced'];
const ANGLES: readonly CameraAngle[] = ['dtl', 'face-on'];
const MODES: readonly RuleMode[] = ['recommended', 'custom'];
const LIBRARY_IDS: ReadonlySet<string> = new Set(RULE_LIBRARY.map((r) => r.id));

function oneOf<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Clamp to the slider range and step; a non-number falls back to the default cap. */
export function clampMediaCapMb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MEDIA_CAP_MB;
  const stepped = Math.round(value / MEDIA_CAP_STEP_MB) * MEDIA_CAP_STEP_MB;
  return Math.min(MEDIA_CAP_MAX_MB, Math.max(MEDIA_CAP_MIN_MB, stepped));
}

/** Only ids that exist in the library, first occurrence wins, order preserved. */
export function sanitizeRuleIds(value: unknown, libraryIds: ReadonlySet<string> = LIBRARY_IDS): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id === 'string' && libraryIds.has(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * Field-by-field validation: one bad field falls back to its default without losing the
 * rest. Never throws.
 */
export function sanitizeSettings(value: unknown): AppSettings {
  const d = defaultSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return d;
  const v = value as Record<string, unknown>;
  if (v.version !== undefined && v.version !== 1) return d;
  return {
    version: 1,
    language: oneOf(LANGUAGES, v.language, d.language),
    mediaCapMb: v.mediaCapMb === undefined ? d.mediaCapMb : clampMediaCapMb(v.mediaCapMb),
    level: oneOf(LEVELS, v.level, d.level),
    defaultAngle: oneOf(ANGLES, v.defaultAngle, d.defaultAngle),
    ruleMode: oneOf(MODES, v.ruleMode, d.ruleMode),
    customRuleIds: sanitizeRuleIds(v.customRuleIds),
  };
}

/** Missing file (null), empty or corrupt JSON → defaults. */
export function parseSettings(raw: string | null | undefined): AppSettings {
  if (!raw) return defaultSettings();
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify(settings);
}

/** A partial update goes through the same validation as a load. */
export function applySettingsPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return sanitizeSettings({ ...current, ...patch, version: 1 });
}
