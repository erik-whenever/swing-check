import type { CameraAngle } from './cameraAngle';
import { ruleMatchesAngle } from './cameraAngle';
import type { LibraryRule } from '../data/ruleLibrary';
import { RULE_LIBRARY } from '../data/ruleLibrary';

/**
 * Rekommenderat regelset (F-1, ADR-0005). Ren och deterministisk: samma indata ger alltid samma
 * lista, och inget Claude-anrop görs. Utdata är biblioteks-id:n i visningsordning plus
 * maskinläsbara motiveringskoder — användartexten översätts i skalet via i18n, inte här.
 */

export type PlayerLevel = 'beginner' | 'intermediate' | 'advanced';

export type RulePhase = LibraryRule['phase'];

/**
 * V-1:s mätning för en regel. Saknas en regel i kartan är den okänd (ej mätt än), vilket är
 * något annat än underkänd.
 */
export interface RuleAccuracy {
  /** Andel rätta domar av de svar som inte är `cannot_determine` (0–1). */
  accuracy: number;
  /** Andel självsäkra fel (fel dom med confidence ≥ 0,8) av alla svar (0–1). */
  confidentErrorRate: number;
  /** Antal sving × körning som mätningen bygger på. */
  samples: number;
}

/** Biblioteks-id → V-1-mätning. Tom tills V-1 körts. */
export type RuleAccuracyMap = Readonly<Record<string, RuleAccuracy>>;

export const NO_ACCURACY_DATA: RuleAccuracyMap = Object.freeze({});

// OSÄKER: gränsvärdena är platshållare tills V-1:s baslinje finns. Risk: medel — för snäva
// tömmer rekommendationen, för lösa släpper in regler som ger självsäkra fel. Sätts av Erik mot facit.
export const ACCURACY_GATE = {
  minAccuracy: 0.8,
  maxConfidentErrorRate: 0.1,
  /** Färre mätningar än så räknas som okänd, inte som godkänd/underkänd. */
  minSamples: 9,
} as const;

export type ValidationStatus = 'validated' | 'unvalidated';

export type RecommendationReason =
  /** Regeln kan bedömas från vald kameravinkel. Gäller alltid — annars är den inte med. */
  | 'angle-match'
  /** Regeln ligger i den fas användaren valt som mål. */
  | 'goal-phase'
  /** Regeln är den högst prioriterade i sin fas för nivån (en per fas först). */
  | 'level-phase-priority'
  /** Regeln har högsta vikt (3) i biblioteket. */
  | 'high-weight';

export interface RuleRecommendation {
  libraryId: string;
  validation: ValidationStatus;
  /** Ordnade: viktigaste skälet först. Visas som en kort rad per regel. */
  reasons: RecommendationReason[];
}

export interface RecommendRulesInput {
  angle: CameraAngle;
  level: PlayerLevel;
  /** Valfritt mål: en fas användaren vill jobba med. Dess regler hamnar först. */
  goalPhase?: RulePhase;
  /** V-1:s mätningar. Utelämnad = inget mätt än. */
  accuracy?: RuleAccuracyMap;
  /** För tester; standard är `RULE_LIBRARY`. */
  library?: readonly LibraryRule[];
}

/**
 * Fasordning och tak per nivå (förslag i ADR-0005, kräver Eriks godkännande).
 * - Nybörjare: uppställning och finish först — de syns tydligast på en stillbild och rättas
 *   utan att svingen måste byggas om. Få regler, så att feedbacken i hörlurarna går att följa.
 * - Medel: baksving och uppställning, sedan nedsving.
 * - Avancerad: nedsving och impact först, där resten av svingen redan sitter.
 */
export const LEVEL_PROFILE: Readonly<
  Record<PlayerLevel, { phaseOrder: readonly RulePhase[]; maxRules: number }>
> = {
  beginner: {
    phaseOrder: ['address', 'follow', 'backswing', 'top', 'downswing', 'impact'],
    maxRules: 3,
  },
  intermediate: {
    phaseOrder: ['backswing', 'address', 'downswing', 'top', 'impact', 'follow'],
    maxRules: 5,
  },
  advanced: {
    phaseOrder: ['downswing', 'impact', 'backswing', 'top', 'address', 'follow'],
    maxRules: 6,
  },
};

/** Godkänd, underkänd eller okänd enligt V-1-grinden. */
export function accuracyVerdict(
  m: RuleAccuracy | undefined,
): 'pass' | 'fail' | 'unknown' {
  if (!m || m.samples < ACCURACY_GATE.minSamples) return 'unknown';
  return m.accuracy >= ACCURACY_GATE.minAccuracy &&
    m.confidentErrorRate <= ACCURACY_GATE.maxConfidentErrorRate
    ? 'pass'
    : 'fail';
}

export function recommendRules(input: RecommendRulesInput): RuleRecommendation[] {
  const library = input.library ?? RULE_LIBRARY;
  const accuracy = input.accuracy ?? NO_ACCURACY_DATA;
  const profile = LEVEL_PROFILE[input.level];
  const phaseRank = (p: RulePhase) => {
    const i = profile.phaseOrder.indexOf(p);
    return i === -1 ? profile.phaseOrder.length : i;
  };

  // Grind: vinkeln måste stämma, och en regel som V-1 underkänt är aldrig med. Okänd får vara
  // med men märks `unvalidated` (beslut i ADR-0005, väntar på Erik).
  const candidates = library
    .map((rule, libIndex) => ({ rule, libIndex, verdict: accuracyVerdict(accuracy[rule.id]) }))
    .filter((c) => ruleMatchesAngle(c.rule, input.angle) && c.verdict !== 'fail');

  // Total ordning: mål-fas, validerad före ovaliderad, nivåns fasordning, vikt, bibliotekets ordning.
  const sorted = [...candidates].sort((a, b) => {
    const goal = Number(b.rule.phase === input.goalPhase) - Number(a.rule.phase === input.goalPhase);
    if (goal) return goal;
    const val = Number(b.verdict === 'pass') - Number(a.verdict === 'pass');
    if (val) return val;
    const phase = phaseRank(a.rule.phase) - phaseRank(b.rule.phase);
    if (phase) return phase;
    if (a.rule.weight !== b.rule.weight) return b.rule.weight - a.rule.weight;
    return a.libIndex - b.libIndex;
  });

  // En regel per fas först, så att setet täcker svingen i stället för att fastna i uppställningen;
  // sedan fylls taket i samma ordning.
  const picked: typeof sorted = [];
  const phasesTaken = new Set<RulePhase>();
  const phaseLeaders = new Set<string>();
  for (const c of sorted) {
    if (picked.length >= profile.maxRules) break;
    if (phasesTaken.has(c.rule.phase)) continue;
    phasesTaken.add(c.rule.phase);
    phaseLeaders.add(c.rule.id);
    picked.push(c);
  }
  for (const c of sorted) {
    if (picked.length >= profile.maxRules) break;
    if (!picked.includes(c)) picked.push(c);
  }
  // Visningsordning = urvalsordning sorterad på samma nyckel, så att mål-fasen och
  // validerade regler ligger överst även efter per-fas-passet.
  picked.sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));

  return picked.map((c) => {
    const reasons: RecommendationReason[] = [];
    if (input.goalPhase && c.rule.phase === input.goalPhase) reasons.push('goal-phase');
    if (phaseLeaders.has(c.rule.id)) reasons.push('level-phase-priority');
    if (c.rule.weight === 3) reasons.push('high-weight');
    reasons.push('angle-match');
    return {
      libraryId: c.rule.id,
      validation: c.verdict === 'pass' ? 'validated' : 'unvalidated',
      reasons,
    };
  });
}
