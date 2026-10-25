import { describe, expect, it } from 'vitest';
import {
  CONFIDENT_THRESHOLD,
  MISSING_OBSERVATION,
  costUsd,
  median,
  percentile,
  renderScoreMarkdown,
  scoreRuns,
  type FacitRow,
  type ModelRuleResult,
  type Pricing,
  type RunResult,
  type Verdict,
} from './v1-score.ts';

const PRICING: Pricing = {
  inputPerMillionTokens: 3,
  outputPerMillionTokens: 15,
  cacheWritePerMillionTokens: 3.75,
  cacheReadPerMillionTokens: 0.3,
};
const USAGE = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

const v = (id: string, verdict: Verdict, confidence = 0.9): ModelRuleResult => ({ id, verdict, confidence });
const res = (swingId: string, k: number, rules: ModelRuleResult[], extra: Partial<RunResult> = {}): RunResult => ({
  swingId, k, wallMs: 1000 * k, usage: USAGE, analysis: { rules }, ...extra,
});

describe('costUsd', () => {
  it('räknar varje tokenslag med sitt pris', () => {
    expect(costUsd({ inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6, cacheCreationTokens: 1e6 }, PRICING)).toBeCloseTo(3 + 15 + 0.3 + 3.75);
  });
  it('tar prislistan som parameter', () => {
    expect(costUsd(USAGE, { ...PRICING, inputPerMillionTokens: 1 })).toBe(1);
  });
});

describe('percentile och median', () => {
  it('närmaste rang: p95 av 1..20 är 19, av 1..120 är 114', () => {
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBe(19);
    expect(percentile(Array.from({ length: 120 }, (_, i) => i + 1), 0.95)).toBe(114);
  });
  it('p95 av ett värde är värdet; tom lista ger null', () => {
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.95)).toBeNull();
  });
  it('median sorterar och tar mitten (medel vid jämnt n)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('scoreRuns', () => {
  const facit: FacitRow[] = [
    { swingId: 'a', ruleId: 'r1', verdict: 'pass' },
    { swingId: 'a', ruleId: 'r2', verdict: 'fail' },
    { swingId: 'a', ruleId: 'r3', verdict: 'cannot_determine' },
    { swingId: 'b', ruleId: 'r1', verdict: 'fail' },
    { swingId: 'b', ruleId: 'r2', verdict: 'fail' },
  ];
  const results: RunResult[] = [
    // r1: a rätt ×3; b fel ×3, varav två självsäkra (0,8 och 0,95) och ett osäkert (0,5)
    // r2: a pass/fail/fail (en fel, osäkert); b cd, utelämnad, fail
    // r3: facit cd — räknas inte i träffsäkerheten
    res('a', 1, [v('r1', 'pass'), v('r2', 'pass', 0.6), v('r3', 'pass')]),
    res('a', 2, [v('r1', 'pass'), v('r2', 'fail'), v('r3', 'pass')]),
    res('a', 3, [v('r1', 'pass'), v('r2', 'fail'), v('r3', 'pass')]),
    res('b', 1, [v('r1', 'pass', CONFIDENT_THRESHOLD), v('r2', 'cannot_determine', 0.4)]),
    res('b', 2, [v('r1', 'pass', 0.95), { id: 'r2', verdict: 'cannot_determine', confidence: 0, observation: MISSING_OBSERVATION }]),
    res('b', 3, [v('r1', 'pass', 0.5), v('r2', 'fail'), v('r-extra', 'fail')]),
  ];
  const s = scoreRuns(facit, results, { runs: 3, pricing: PRICING });
  const r = (id: string) => s.perRule.find((x) => x.ruleId === id)!;

  it('träffsäkerhet per regel bland avgjorda', () => {
    expect(r('r1')).toMatchObject({ judgments: 6, decided: 6, correct: 3, accuracy: 0.5 });
    expect(r('r2')).toMatchObject({ judgments: 6, decided: 4, correct: 3, accuracy: 0.75, modelCd: 2, missing: 1 });
  });

  it('facit cannot_determine redovisas separat, aldrig som träff eller fel', () => {
    expect(r('r3')).toMatchObject({ judgments: 3, facitCd: 3, decided: 0, accuracy: null, confidentWrongRate: null });
  });

  it('självsäkra fel: fel dom med confidence ≥ 0,8 (gränsen inräknad)', () => {
    expect(r('r1').confidentWrong).toBe(2);
    expect(r('r1').confidentWrongRate).toBeCloseTo(2 / 6);
    expect(r('r2').confidentWrong).toBe(0);
  });

  it('konsistens: samma dom i alla körningar; cd räknas som en dom', () => {
    expect(r('r1')).toMatchObject({ completePairs: 2, consistentPairs: 2, consistency: 1 });
    // a: pass/fail/fail nej; b: cd/cd(utelämnad)/fail nej
    expect(r('r2')).toMatchObject({ completePairs: 2, consistentPairs: 0, consistency: 0 });
    // r3 över facit-cd räknas ändå — konsistens är modellens egenskap
    expect(r('r3')).toMatchObject({ completePairs: 1, consistentPairs: 1 });
  });

  it('regler utanför facit poängsätts inte', () => {
    expect(s.perRule.map((x) => x.ruleId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('totalt = summan över reglerna', () => {
    expect(s.total).toMatchObject({ judgments: 15, decided: 10, correct: 6, accuracy: 0.6, facitCd: 3, modelCd: 2, confidentWrong: 2, completePairs: 5, consistentPairs: 3 });
  });

  it('kostnad och tid per analys', () => {
    expect(s.analyses).toBe(6);
    expect(s.costUsd.total).toBeCloseTo(18);
    expect(s.costUsd.median).toBeCloseTo(3);
    expect(s.tokens.input).toBe(6_000_000);
    expect(s.wallMs).toMatchObject({ n: 6, median: 2000, p95: 3000 });
  });

  it('misslyckat anrop: betalt (kostnad räknas), men ger inga domar och gör paret ofullständigt', () => {
    const failed = scoreRuns(facit, [...results.slice(0, 5), res('b', 3, [], { analysis: null, error: 'TruncatedResponseError', wallMs: 9000 })], { runs: 3, pricing: PRICING });
    const f1 = failed.perRule.find((x) => x.ruleId === 'r1')!;
    expect(failed.failedAnalyses).toBe(1);
    expect(f1).toMatchObject({ judgments: 5, completePairs: 1, incompletePairs: 1 });
    expect(failed.costUsd.n).toBe(6);
    expect(failed.wallMs.n).toBe(5);
  });

  it('dubbletter i facit eller rådata kastar', () => {
    expect(() => scoreRuns([...facit, facit[0]], results, { runs: 3, pricing: PRICING })).toThrow(/dubblett/);
    expect(() => scoreRuns(facit, [...results, results[0]], { runs: 3, pricing: PRICING })).toThrow(/dubblett/);
  });

  it('markdown-tabellen har en rad per regel plus totalt', () => {
    const md = renderScoreMarkdown(s, new Map([['r1', 'Regel ett']]));
    expect(md).toContain('| Regel ett `r1` | 6 | 50 % |');
    expect(md).toContain('| **totalt** | 10 | 60 % |');
    expect(md).toMatch(/Tid per analys \(vägg\): median 2\.0 s, p95 3\.0 s/);
  });
});
