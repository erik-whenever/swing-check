import { describe, expect, it, vi } from 'vitest';
import { RULE_LIBRARY } from '@swingcheck/core/data/ruleLibrary';
import { buildSwingPrompt } from '@swingcheck/core/lib/prompt';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import { V1_RULES, V1_SHAFT_RULES } from './v1-rules.ts';
import {
  BOM,
  SONNET_4_5_PRICING,
  buildManifest,
  estimateBudget,
  evalUserId,
  facitTemplateCsv,
  frameSha256,
  parseCsv,
  parseFacit,
  planCalls,
  postTagged,
  rulesForAngle,
  rulesHash,
  runEval,
  runGate,
  verifyManifest,
  type AnalyzeOutcome,
  type CallLogEntry,
  type FramesFile,
  type SelectionEntry,
} from './v1-lib.ts';

const jpeg = (n: number) => Buffer.from([0xff, 0xd8, n, 0xff, 0xd9]).toString('base64');

function fixture(nSwings = 30) {
  const frames = new Map<string, FramesFile>();
  const selection: SelectionEntry[] = [];
  for (let i = 0; i < nSwings; i++) {
    const id = `clip${i}-s01`;
    const angle: CameraAngle = i % 2 ? 'face-on' : 'dtl';
    frames.set(id, { id, clip: `clip${i}.mp4`, angle, frames: [jpeg(i), jpeg(i + 100)] });
    selection.push({ id, player: `S0${i % 3}`, level: i % 2 ? 'hcp 20' : 'hcp 5' });
  }
  return { frames, selection };
}

describe('eval-reglerna', () => {
  it('innehåller hela biblioteket, länkat via libraryId, med bibliotekets text', () => {
    for (const l of RULE_LIBRARY) {
      const r = V1_RULES.find((x) => x.libraryId === l.id);
      expect(r).toMatchObject({ id: `r-${l.id}`, title: l.title, description: l.description, phase: l.phase, weight: l.weight, angles: l.angles, drills: l.drills, active: true });
    }
  });
  it('har 6–10 skaftberoende regler, egna id, inga libraryId, giltiga fält', () => {
    expect(V1_SHAFT_RULES.length).toBeGreaterThanOrEqual(6);
    expect(V1_SHAFT_RULES.length).toBeLessThanOrEqual(10);
    for (const r of V1_SHAFT_RULES) {
      expect(r.id).toMatch(/^v1-shaft-/);
      expect(r.libraryId).toBeUndefined();
      expect(r.angles?.length).toBe(1);
      expect([1, 2, 3]).toContain(r.weight);
      expect(['address', 'backswing', 'top', 'downswing', 'impact', 'follow']).toContain(r.phase);
    }
    expect(new Set(V1_RULES.map((r) => r.id)).size).toBe(V1_RULES.length);
  });
  it('båda vinklarna har skaftregler, och quick-taket ryms under Workerns 2000', () => {
    for (const a of ['dtl', 'face-on'] as const) {
      const rules = rulesForAngle(V1_RULES, a);
      expect(rules.some((r) => r.id.startsWith('v1-shaft-'))).toBe(true);
      expect(200 + 120 * rules.length).toBeLessThanOrEqual(2000);
    }
  });
  it('går genom appens egen promptbyggare med varje regel-id', () => {
    const prompt = buildSwingPrompt({ rules: rulesForAngle(V1_RULES, 'dtl'), focusRuleId: null, cameraAngle: 'down-the-line', quickMode: true });
    for (const r of rulesForAngle(V1_RULES, 'dtl')) expect(prompt).toContain(`[ID: ${r.id}]`);
  });
});

describe('manifest', () => {
  it('sha256 över JPEG-bytes, oberoende av data:-prefix', () => {
    expect(frameSha256(`data:image/jpeg;base64,${jpeg(1)}`)).toBe(frameSha256(jpeg(1)));
    expect(frameSha256(jpeg(1))).not.toBe(frameSha256(jpeg(2)));
  });

  it('fryser id, vinkel, metadata och sha256 per bildruta; verifieras rent', () => {
    const { frames, selection } = fixture();
    const { manifest, warnings } = buildManifest(selection, frames, V1_RULES, '2026-10-25T00:00:00Z');
    expect(warnings).toEqual([]);
    expect(manifest.swings).toHaveLength(30);
    expect(manifest.swings[1]).toMatchObject({ id: 'clip1-s01', angle: 'face-on', player: 'S01', level: 'hcp 20', frameCount: 2 });
    expect(manifest.swings[1].frameSha256[0]).toBe(frameSha256(jpeg(1)));
    expect(manifest.rulesHash).toBe(rulesHash(V1_RULES));
    expect(verifyManifest(manifest, frames, V1_RULES)).toEqual([]);
  });

  it('verifieringen hittar ändrad bildruta, saknad fil och ändrade regler', () => {
    const { frames, selection } = fixture();
    const { manifest } = buildManifest(selection, frames, V1_RULES, 'x');
    const changed = new Map(frames);
    changed.set('clip0-s01', { ...frames.get('clip0-s01')!, frames: [jpeg(99), jpeg(100)] });
    changed.delete('clip2-s01');
    const rules = V1_RULES.map((r, i) => (i === 0 ? { ...r, description: r.description + '!' } : r));
    const problems = verifyManifest(manifest, changed, rules);
    expect(problems.some((p) => /rulesHash/.test(p))).toBe(true);
    expect(problems).toContain('clip0-s01: bildruta 0 har annan sha256');
    expect(problems).toContain('clip2-s01: bildrutefil saknas');
  });

  it('vägrar frysa utanför 30–50 svingar, vid dubbletter och utan metadata', () => {
    const { frames, selection } = fixture(29);
    expect(() => buildManifest(selection, frames, V1_RULES, 'x')).toThrow(/29 svingar/);
    const big = fixture();
    expect(() => buildManifest([...big.selection, big.selection[0]], big.frames, V1_RULES, 'x')).toThrow(/dubblett/);
    expect(() => buildManifest(big.selection.map((s, i) => (i ? s : { ...s, player: '' })), big.frames, V1_RULES, 'x')).toThrow(/player saknas/);
  });

  it('varnar (men fryser) om bara en vinkel finns', () => {
    const { frames, selection } = fixture();
    for (const f of frames.values()) f.angle = 'dtl';
    expect(buildManifest(selection, frames, V1_RULES, 'x').warnings[0]).toMatch(/bara vinkeln dtl/);
  });
});

describe('facit', () => {
  const { frames, selection } = fixture();
  const { manifest } = buildManifest(selection, frames, V1_RULES, 'x');
  const template = facitTemplateCsv(manifest, V1_RULES);
  const expectedRows = manifest.swings.reduce((a, s) => a + rulesForAngle(V1_RULES, s.angle).length, 0);

  it('mallen har en rad per sving × regel för svingens vinkel, semikolonseparerad', () => {
    const rows = parseCsv(template);
    expect(rows[0]).toEqual(['swing_id', 'angle', 'rule_id', 'rule_title', 'phase', 'verdict', 'note']);
    expect(rows).toHaveLength(expectedRows + 1);
    expect(template.split('\r\n')[0]).toContain(';');
    expect(template.startsWith(BOM)).toBe(true);
  });

  it('tom mall: alla domar saknas; allowEmpty räknar dem', () => {
    expect(parseFacit(template, manifest, V1_RULES).errors).toHaveLength(expectedRows);
    expect(parseFacit(template, manifest, V1_RULES, { allowEmpty: true })).toMatchObject({ errors: [], empty: expectedRows });
  });

  it('ifyllt facit läses; versaler och blanksteg tolereras', () => {
    const filled = parseCsv(template).map((r, i) => (i === 0 ? r : [...r.slice(0, 5), i % 3 ? ' PASS ' : 'cannot_determine', ''])) ;
    const csv = filled.map((r) => r.map((c) => (c.includes(';') ? `"${c}"` : c)).join(';')).join('\n');
    const out = parseFacit(csv, manifest, V1_RULES);
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(expectedRows);
    expect(out.rows[0]).toMatchObject({ swingId: 'clip0-s01', ruleId: 'r-lib-spine-angle', verdict: 'pass' });
  });

  it('kommaseparerad fil med citerade fält läses också', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('fel: ogiltig dom, okänd rad, dubblett, saknad rad', () => {
    const lines = template.slice(BOM.length).trim().split('\r\n');
    const fill = (l: string) => l.replace(/;;$/, ';pass;');
    const body = lines.slice(1).map(fill);
    body[0] = body[0].replace(';pass;', ';maybe;');
    body.pop();
    body.push(body[1]);
    body.push('ghost;dtl;r-lib-spine-angle;x;address;pass;');
    const errors = parseFacit([lines[0], ...body].join('\n'), manifest, V1_RULES).errors;
    expect(errors.some((e) => /ogiltig dom "maybe"/.test(e))).toBe(true);
    expect(errors.some((e) => /dubblett/.test(e))).toBe(true);
    expect(errors.some((e) => /ghost × r-lib-spine-angle finns inte/.test(e))).toBe(true);
    expect(errors.some((e) => /^saknar rad/.test(e))).toBe(true);
  });
});

describe('budget och spärr', () => {
  const angles: CameraAngle[] = [...Array(20).fill('dtl'), ...Array(20).fill('face-on')];
  const e = estimateBudget(angles, 3, V1_RULES);

  it('40 svingar × 3 = 120 anrop, inom ett rimligt intervall per anrop', () => {
    expect(e.calls).toBe(120);
    // S-48: $0,027–0,041 med 7 regler; fler regler ger mer output → något över.
    expect(e.perCallUsd.low).toBeGreaterThan(0.027);
    expect(e.perCallUsd.high).toBeGreaterThan(0.041);
    expect(e.perCallUsd.high).toBeLessThan(0.07);
    expect(e.totalUsd.high).toBeCloseTo(e.perCallUsd.high * 120, 6);
  });

  it('S-48:s egen konfiguration (7 DTL-regler): nedre gräns ≈ uppmätt lägsta, övre gräns över uppmätt högsta', () => {
    // Uppmätt $0,027–0,041. Övre gränsen antar att alla regler blir fail (115 tokens
    // var) och svansen är maximal — ett värsta fall S-48 inte nådde, med avsikt.
    const dtl7 = rulesForAngle(V1_RULES, 'dtl').filter((r) => r.libraryId);
    const s48 = estimateBudget(['dtl'], 1, dtl7, SONNET_4_5_PRICING);
    expect(s48.perCallUsd.low).toBeCloseTo(0.027, 2);
    expect(s48.perCallUsd.high).toBeGreaterThanOrEqual(0.041);
    expect(s48.perCallUsd.high).toBeLessThan(0.046);
  });

  it('dry-run utan flagga; vägrar ogiltig eller för låg budget; live när budgeten täcker övre gränsen', () => {
    expect(runGate([], e).mode).toBe('dry-run');
    expect(runGate(['--approved-budget'], e).mode).toBe('refuse');
    expect(runGate(['--approved-budget=abc'], e).mode).toBe('refuse');
    expect(runGate(['--approved-budget=0'], e).mode).toBe('refuse');
    expect(runGate(['--approved-budget=1'], e)).toMatchObject({ mode: 'refuse', reason: expect.stringMatching(/be Erik/) });
    expect(runGate(['--approved-budget=8'], e)).toEqual({ mode: 'live', approvedUsd: 8 });
  });
});

describe('körningen (mockad transport — inga riktiga anrop)', () => {
  const { frames, selection } = fixture();
  const { manifest } = buildManifest(selection, frames, V1_RULES, 'x');
  const usage = { inputTokens: 6000, outputTokens: 1200, cacheReadTokens: 2000, cacheCreationTokens: 0 };
  const ok = async (): Promise<AnalyzeOutcome> => ({ wallMs: 30_000, usage, analysis: { rules: [] } });

  it('planen: körning 1 för alla svingar först, hoppar över redan gjorda', () => {
    const plan = planCalls(manifest, 3, new Set(['clip0-s01#1']));
    expect(plan).toHaveLength(89);
    expect(plan[0]).toMatchObject({ swingId: 'clip1-s01', k: 1 });
    expect(plan[29]).toMatchObject({ swingId: 'clip0-s01', k: 2 });
  });

  it('loggar varje anrop med märkning FÖRE sändning och skriver resultatet efter', async () => {
    const order: string[] = [];
    const calls: CallLogEntry[] = [];
    const out = await runEval({
      plan: planCalls(manifest, 1).slice(0, 2), tag: 'baseline', maxCalls: 90, alreadySent: 0, spentUsd: 0,
      approvedUsd: 8, perCallHighUsd: 0.055, pricing: SONNET_4_5_PRICING,
      analyze: async (_call, userId) => { order.push(`send ${userId}`); return ok(); },
      logCall: (e) => { order.push(`log ${e.userId}`); calls.push(e); },
      logResult: (r) => order.push(`result ${r.swingId}`),
      now: () => 't',
    });
    expect(order).toEqual([
      'log v1-eval-baseline-clip0-s01-k1', 'send v1-eval-baseline-clip0-s01-k1', 'result clip0-s01',
      'log v1-eval-baseline-clip1-s01-k1', 'send v1-eval-baseline-clip1-s01-k1', 'result clip1-s01',
    ]);
    expect(calls[0]).toEqual({ sentAt: 't', tag: 'baseline', swingId: 'clip0-s01', k: 1, userId: evalUserId('baseline', 'clip0-s01', 1) });
    expect(out).toMatchObject({ sent: 2, stopped: null });
    expect(out.spentUsd).toBeCloseTo(2 * (6000 * 3 + 1200 * 15 + 2000 * 0.3) / 1e6);
  });

  it('stannar vid anropstaket, även räknat med tidigare avbrutna körningar', async () => {
    const analyze = vi.fn(ok);
    const out = await runEval({
      plan: planCalls(manifest, 3), tag: 't', maxCalls: 90, alreadySent: 88, spentUsd: 0, approvedUsd: 100,
      perCallHighUsd: 0.055, pricing: SONNET_4_5_PRICING, analyze, logCall: () => {}, logResult: () => {},
    });
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(out.stopped).toMatch(/taket 90/);
  });

  it('stannar innan ett anrop som kunde passera den godkända budgeten', async () => {
    const analyze = vi.fn(ok);
    const out = await runEval({
      plan: planCalls(manifest, 3), tag: 't', maxCalls: 90, alreadySent: 0, spentUsd: 7.95, approvedUsd: 8,
      perCallHighUsd: 0.055, pricing: SONNET_4_5_PRICING, analyze, logCall: () => {}, logResult: () => {},
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(out.stopped).toMatch(/godkänt \$8\.00/);
  });

  it('misslyckat anrop försöks inte om, och dess kostnad räknas', async () => {
    const analyze = vi.fn(async (): Promise<AnalyzeOutcome> => ({ wallMs: 1, usage, analysis: null, error: 'TruncatedResponseError: cut off' }));
    const results: unknown[] = [];
    const out = await runEval({
      plan: planCalls(manifest, 1).slice(0, 1), tag: 't', maxCalls: 30, alreadySent: 0, spentUsd: 0, approvedUsd: 8,
      perCallHighUsd: 0.055, pricing: SONNET_4_5_PRICING, analyze, logCall: () => {}, logResult: (r) => results.push(r),
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ error: expect.stringMatching(/Truncated/) });
    expect(out.spentUsd).toBeGreaterThan(0);
  });

  it('postTagged märker kroppen och skickar med dev-Origin (mockad fetch)', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const r = await postTagged(fetchMock as unknown as typeof fetch, 'http://w/api/analyze', JSON.stringify({ model: 'm', messages: [] }), 'v1-eval-x', 'http://localhost:5173');
    expect(r).toEqual({ status: 200, text: '{"ok":true}' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://w/api/analyze');
    expect((init.headers as Record<string, string>).Origin).toBe('http://localhost:5173');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'm', messages: [], metadata: { user_id: 'v1-eval-x' } });
  });
});
