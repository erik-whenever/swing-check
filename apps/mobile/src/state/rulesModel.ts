// Pure derivation of the active rule set (N-3.6, F-1/ADR-0005). The recommended set comes
// from core's recommendRules; a custom set is the user's own pick, given the same
// validation status so the UI shows "ej validerad" either way. No expo imports.

import {
  accuracyVerdict,
  NO_ACCURACY_DATA,
  recommendRules,
  type RecommendationReason,
  type RuleAccuracyMap,
  type RulePhase,
  type ValidationStatus,
} from '@swingcheck/core/lib/recommendRules';
import { ruleMatchesAngle, type CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import { RULE_LIBRARY, type LibraryRule } from '@swingcheck/core/data/ruleLibrary';
import type { AppSettings } from './settingsModel';

export interface ActiveRule {
  libraryId: string;
  rule: LibraryRule;
  /** 'unvalidated' → shown as "ej validerad" until V-1 has measured and passed it. */
  validation: ValidationStatus;
  /** Recommendation reasons (i18n codes); empty for a custom pick. */
  reasons: RecommendationReason[];
  /** False for a custom rule that cannot be judged from the chosen angle. */
  matchesAngle: boolean;
}

export interface ActiveRuleSet {
  mode: AppSettings['ruleMode'];
  angle: CameraAngle;
  rules: ActiveRule[];
  /** Nothing to analyse against — custom mode with nothing picked, or an empty recommendation. */
  empty: boolean;
}

export interface DeriveRulesInput {
  settings: Pick<AppSettings, 'level' | 'ruleMode' | 'customRuleIds' | 'defaultAngle'>;
  /** Defaults to the settings' default angle. */
  angle?: CameraAngle;
  goalPhase?: RulePhase;
  /** V-1 measurements; none yet → every rule is 'unvalidated'. */
  accuracy?: RuleAccuracyMap;
  library?: readonly LibraryRule[];
}

export function deriveActiveRules(input: DeriveRulesInput): ActiveRuleSet {
  const library = input.library ?? RULE_LIBRARY;
  const accuracy = input.accuracy ?? NO_ACCURACY_DATA;
  const angle = input.angle ?? input.settings.defaultAngle;
  const byId = new Map(library.map((r) => [r.id, r]));

  if (input.settings.ruleMode === 'recommended') {
    const rules = recommendRules({
      angle,
      level: input.settings.level,
      goalPhase: input.goalPhase,
      accuracy,
      library,
    }).flatMap((rec): ActiveRule[] => {
      const rule = byId.get(rec.libraryId);
      return rule
        ? [{ libraryId: rec.libraryId, rule, validation: rec.validation, reasons: rec.reasons, matchesAngle: true }]
        : [];
    });
    return { mode: 'recommended', angle, rules, empty: rules.length === 0 };
  }

  // Custom: the user's choice and order are kept, even a rule V-1 has failed — they chose
  // it. It is marked unvalidated like an unmeasured one.
  // OSÄKER: ADR-0005 drops a failed rule from the RECOMMENDED set but says nothing about a
  // custom pick. Kept + flagged here. Risk: low — visible to the user and reversible.
  const rules = input.settings.customRuleIds.flatMap((id): ActiveRule[] => {
    const rule = byId.get(id);
    if (!rule) return [];
    return [
      {
        libraryId: id,
        rule,
        validation: accuracyVerdict(accuracy[id]) === 'pass' ? 'validated' : 'unvalidated',
        reasons: [],
        matchesAngle: ruleMatchesAngle(rule, angle),
      },
    ];
  });
  return { mode: 'custom', angle, rules, empty: rules.length === 0 };
}

/** Rules to send to the analysis: custom picks that cannot be judged from this angle are left out. */
export function analysableRules(set: ActiveRuleSet): LibraryRule[] {
  return set.rules.filter((r) => r.matchesAngle).map((r) => r.rule);
}

/** Toggle one id in a custom list (appended when added; order otherwise kept). */
export function toggleCustomRule(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
