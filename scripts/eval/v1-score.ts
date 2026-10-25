// V-1 — poängsättning. Ren modul: facit + rådata + prislista in, mätvärden ut. Inga
// filer, ingen klocka, inget nätverk, så att varje siffra i docs/eval/v1-facit.md kan
// räknas om ur rådatan och testas (v1-score.test.ts).
//
// DEFINITIONER (BACKLOG V-1, låsta här):
// - En *bedömning* = en (sving, regel, körning) där facit har en rad och anropet lyckades.
// - Facit `cannot_determine` → bedömningen räknas inte i träffsäkerheten, redovisas som
//   `facitCd`. Det finns inget rätt svar att träffa.
// - Modellen svarar `cannot_determine` (eller utelämnar regeln, som api.ts fyller i som
//   cannot_determine med observation "Missing from model response") där facit är pass/fail
//   → `modelCd` (utelämnade även i `missing`). Ingen träff, inget fel.
// - *Avgjord* = facit pass/fail OCH modellen pass/fail. Träffsäkerhet = rätt / avgjorda.
// - *Självsäkert fel* = avgjord, fel dom, confidence ≥ 0,8 (CONFIDENT_THRESHOLD).
// - *Konsistens* = andel (sving, regel) med samma dom i alla körningar, bland par där alla
//   `runs` körningar lyckades. Par där någon körning saknas redovisas som `incompletePairs`.
//   cannot_determine räknas som en dom här: tre cd är konsistent, cd/pass/pass är det inte.
//   Paren räknas oavsett facit, eftersom konsistens är modellens egenskap, inte facits.
// - Kostnad per analys räknas om ur tokens med `pricing` (parameter, inte api.ts:s tabell),
//   så att samma rådata kan prissättas för en annan modell i V-2.
// - Percentil: närmaste rang, sorted[ceil(q·n) − 1]. Med n = 120 är p95 det 114:e värdet.
//   Vald för att alltid vara ett uppmätt värde, inte en interpolation mellan två anrop.

export type Verdict = 'pass' | 'fail' | 'cannot_determine';

export const VERDICTS: readonly Verdict[] = ['pass', 'fail', 'cannot_determine'];
export const CONFIDENT_THRESHOLD = 0.8;
export const MISSING_OBSERVATION = 'Missing from model response';

export interface FacitRow {
  swingId: string;
  ruleId: string;
  verdict: Verdict;
}

/** Usage som api.ts:s onUsage rapporterar (AnalysisUsage), de fält som behövs här. */
export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ModelRuleResult {
  id: string;
  verdict: Verdict;
  confidence: number;
  observation?: string;
}

/** En rad i results.jsonl: ett anrop = en analys av en sving. */
export interface RunResult {
  swingId: string;
  /** Körningens nummer, 1..runs. */
  k: number;
  /** Vägg-tid för analyzeSwing i sidan, ms. */
  wallMs: number | null;
  usage: UsageRecord | null;
  analysis: { rules: ModelRuleResult[] } | null;
  error?: string;
}

export interface Pricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  cacheWritePerMillionTokens: number;
  cacheReadPerMillionTokens: number;
}

export interface RuleScore {
  ruleId: string;
  judgments: number;
  facitCd: number;
  modelCd: number;
  missing: number;
  decided: number;
  correct: number;
  /** correct / decided; null om inga avgjorda. */
  accuracy: number | null;
  confidentWrong: number;
  /** confidentWrong / decided; null om inga avgjorda. */
  confidentWrongRate: number | null;
  consistentPairs: number;
  completePairs: number;
  incompletePairs: number;
  /** consistentPairs / completePairs; null om inga kompletta par. */
  consistency: number | null;
}

export interface Distribution {
  n: number;
  mean: number | null;
  median: number | null;
  p95: number | null;
}

export interface Score {
  runs: number;
  analyses: number;
  failedAnalyses: number;
  perRule: RuleScore[];
  total: RuleScore;
  tokens: { input: number; output: number; cacheRead: number; cacheCreation: number };
  costUsd: Distribution & { total: number };
  wallMs: Distribution;
}

export function costUsd(u: UsageRecord, p: Pricing): number {
  return (
    (u.inputTokens * p.inputPerMillionTokens +
      u.outputTokens * p.outputPerMillionTokens +
      u.cacheCreationTokens * p.cacheWritePerMillionTokens +
      u.cacheReadTokens * p.cacheReadPerMillionTokens) /
    1_000_000
  );
}

/** Närmaste rang; null för tom lista. */
export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

/** Median som medelvärdet av de två mittersta vid jämnt n (den vanliga definitionen). */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function distribution(values: readonly number[]): Distribution {
  return {
    n: values.length,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    median: median(values),
    p95: percentile(values, 0.95),
  };
}

function emptyRuleScore(ruleId: string): RuleScore {
  return {
    ruleId,
    judgments: 0,
    facitCd: 0,
    modelCd: 0,
    missing: 0,
    decided: 0,
    correct: 0,
    accuracy: null,
    confidentWrong: 0,
    confidentWrongRate: null,
    consistentPairs: 0,
    completePairs: 0,
    incompletePairs: 0,
    consistency: null,
  };
}

function finish(s: RuleScore): RuleScore {
  return {
    ...s,
    accuracy: s.decided ? s.correct / s.decided : null,
    confidentWrongRate: s.decided ? s.confidentWrong / s.decided : null,
    consistency: s.completePairs ? s.consistentPairs / s.completePairs : null,
  };
}

const key = (swingId: string, ruleId: string) => `${swingId}\u0000${ruleId}`;

/**
 * Alla mätvärden ur facit och rådata.
 *
 * `runs` är det planerade antalet körningar per sving (3 i V-1); konsistensen kräver att
 * alla finns. Regler som saknas i facit poängsätts inte — facit bestämmer vilka par som
 * ingår, så att en regel som råkar komma med i ett svar aldrig blir ett mätvärde.
 * Dubbletter (samma sving och körning två gånger) är ett fel i rådatan och kastar.
 */
export function scoreRuns(
  facit: readonly FacitRow[],
  results: readonly RunResult[],
  options: { runs: number; pricing: Pricing },
): Score {
  const { runs, pricing } = options;
  const facitByPair = new Map<string, Verdict>();
  const ruleOrder: string[] = [];
  const pairsBySwing = new Map<string, string[]>();
  for (const f of facit) {
    const k = key(f.swingId, f.ruleId);
    if (facitByPair.has(k)) throw new Error(`facit: dubblett ${f.swingId} × ${f.ruleId}`);
    facitByPair.set(k, f.verdict);
    if (!ruleOrder.includes(f.ruleId)) ruleOrder.push(f.ruleId);
    pairsBySwing.set(f.swingId, [...(pairsBySwing.get(f.swingId) ?? []), f.ruleId]);
  }

  const seen = new Set<string>();
  for (const r of results) {
    const k = `${r.swingId}\u0000${r.k}`;
    if (seen.has(k)) throw new Error(`rådata: dubblett ${r.swingId} körning ${r.k}`);
    seen.add(k);
  }

  const perRule = new Map(ruleOrder.map((id) => [id, emptyRuleScore(id)]));
  // (sving, regel) → domar från lyckade körningar
  const verdictsByPair = new Map<string, Verdict[]>();
  const okResults = results.filter((r) => r.analysis && !r.error);

  for (const r of okResults) {
    const byId = new Map(r.analysis!.rules.map((m) => [m.id, m]));
    for (const ruleId of pairsBySwing.get(r.swingId) ?? []) {
      const s = perRule.get(ruleId)!;
      const truth = facitByPair.get(key(r.swingId, ruleId))!;
      const m = byId.get(ruleId);
      const missing = !m || m.observation === MISSING_OBSERVATION;
      const verdict: Verdict = missing ? 'cannot_determine' : m.verdict;
      const confidence = missing ? 0 : m.confidence;

      const pk = key(r.swingId, ruleId);
      verdictsByPair.set(pk, [...(verdictsByPair.get(pk) ?? []), verdict]);

      s.judgments++;
      if (truth === 'cannot_determine') {
        s.facitCd++;
        continue;
      }
      if (verdict === 'cannot_determine') {
        s.modelCd++;
        if (missing) s.missing++;
        continue;
      }
      s.decided++;
      if (verdict === truth) s.correct++;
      else if (confidence >= CONFIDENT_THRESHOLD) s.confidentWrong++;
    }
  }

  for (const [pk] of facitByPair) {
    const ruleId = pk.split('\u0000')[1];
    const s = perRule.get(ruleId)!;
    const vs = verdictsByPair.get(pk) ?? [];
    if (vs.length < runs) {
      s.incompletePairs++;
      continue;
    }
    s.completePairs++;
    if (vs.every((v) => v === vs[0])) s.consistentPairs++;
  }

  const total = emptyRuleScore('TOTAL');
  for (const s of perRule.values()) {
    for (const f of [
      'judgments', 'facitCd', 'modelCd', 'missing', 'decided', 'correct',
      'confidentWrong', 'consistentPairs', 'completePairs', 'incompletePairs',
    ] as const) {
      total[f] += s[f];
    }
  }

  const withUsage = results.filter((r) => r.usage);
  const costs = withUsage.map((r) => costUsd(r.usage!, pricing));
  const walls = okResults.map((r) => r.wallMs).filter((w): w is number => typeof w === 'number');

  return {
    runs,
    analyses: results.length,
    failedAnalyses: results.length - okResults.length,
    perRule: ruleOrder.map((id) => finish(perRule.get(id)!)),
    total: finish(total),
    tokens: {
      input: withUsage.reduce((a, r) => a + r.usage!.inputTokens, 0),
      output: withUsage.reduce((a, r) => a + r.usage!.outputTokens, 0),
      cacheRead: withUsage.reduce((a, r) => a + r.usage!.cacheReadTokens, 0),
      cacheCreation: withUsage.reduce((a, r) => a + r.usage!.cacheCreationTokens, 0),
    },
    // Misslyckade anrop med usage (t.ex. klippta vid max_tokens) är betalda och räknas här.
    costUsd: { ...distribution(costs), total: costs.reduce((a, b) => a + b, 0) },
    wallMs: distribution(walls),
  };
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);

/** Resultattabellen till docs/eval/v1-facit.md. `titles` mappar regel-id → titel. */
export function renderScoreMarkdown(score: Score, titles: ReadonlyMap<string, string> = new Map()): string {
  const row = (s: RuleScore, label: string) =>
    `| ${label} | ${s.decided} | ${pct(s.accuracy)} | ${s.modelCd} (${s.missing}) | ${s.facitCd} | ` +
    `${s.confidentWrong} (${pct(s.confidentWrongRate)}) | ${pct(s.consistency)} (${s.completePairs}) |`;
  const lines = [
    `| regel | avgjorda | träffsäkerhet | modell-cd (utelämnade) | facit-cd | självsäkra fel (andel) | konsistens (par) |`,
    `|---|---:|---:|---:|---:|---:|---:|`,
    ...score.perRule.map((s) => row(s, titles.get(s.ruleId) ? `${titles.get(s.ruleId)} \`${s.ruleId}\`` : `\`${s.ruleId}\``)),
    row(score.total, '**totalt**'),
    '',
    `Analyser: ${score.analyses} (misslyckade ${score.failedAnalyses}), ${score.runs} körningar per sving.`,
    `Tokens: input ${score.tokens.input}, output ${score.tokens.output}, cache-läsning ${score.tokens.cacheRead}, cache-skrivning ${score.tokens.cacheCreation}.`,
    `Kostnad: totalt $${score.costUsd.total.toFixed(2)}; per analys median $${score.costUsd.median?.toFixed(4) ?? '–'}, p95 $${score.costUsd.p95?.toFixed(4) ?? '–'}.`,
    `Tid per analys (vägg): median ${score.wallMs.median === null ? '–' : (score.wallMs.median / 1000).toFixed(1) + ' s'}, p95 ${score.wallMs.p95 === null ? '–' : (score.wallMs.p95 / 1000).toFixed(1) + ' s'}.`,
  ];
  return lines.join('\n');
}
