// V-1 — urval, facit, budget och körspärr. Rena funktioner (förutom sha256 via node:crypto);
// all fil- och webbläsar-I/O ligger i v1.ts, så att allt här kan testas utan klipp och utan
// nätverk (v1-lib.test.ts). Se docs/eval/v1-facit.md för flödet.

import { createHash } from 'node:crypto';
import type { Rule } from '@swingcheck/core/types';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import { VERDICTS, costUsd, type FacitRow, type ModelRuleResult, type Pricing, type UsageRecord, type Verdict } from './v1-score.ts';

// ── Hashning ────────────────────────────────────────────────────────────────

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * sha256 över bildrutans JPEG-bytes, inte över base64-texten: samma bild ger samma hash
 * oavsett om den sparats med eller utan `data:`-prefix.
 */
export function frameSha256(frame: string): string {
  const b64 = frame.startsWith('data:') ? frame.slice(frame.indexOf(',') + 1) : frame;
  return sha256(Buffer.from(b64, 'base64'));
}

/**
 * Hash över reglerna som de skickas (id, text, fas, vikt, vinklar, övningar — allt
 * buildSwingPrompt läser). Fryses i manifestet; körningen vägrar om biblioteket har
 * ändrats sedan, eftersom facit då gäller andra regeltexter än de modellen får.
 */
export function rulesHash(rules: readonly Rule[]): string {
  return sha256(JSON.stringify(rules.map((r) => [r.id, r.title, r.description, r.phase, r.weight, r.angles ?? [], r.drills ?? []])));
}

export function rulesForAngle(rules: readonly Rule[], angle: CameraAngle): Rule[] {
  // Samma villkor som ruleMatchesAngle i core (tom/saknad lista = alla vinklar).
  return rules.filter((r) => !r.angles || r.angles.length === 0 || r.angles.includes(angle));
}

// ── Urval och manifest ──────────────────────────────────────────────────────

/** En sving ur `extract`: data/eval/v1/frames/<id>.json. */
export interface FramesFile {
  id: string;
  clip: string;
  angle: CameraAngle;
  frames: string[];
  phases?: string[];
  times?: number[];
}

/** Eriks urval: data/eval/v1/selection.json → { swings: SelectionEntry[] }. */
export interface SelectionEntry {
  id: string;
  /** Pseudonym, t.ex. "S01" — aldrig ett namn (manifestet committas). */
  player: string;
  /** Fri nivåangivelse, t.ex. "hcp 5", "nybörjare", "tour". */
  level: string;
  handedness?: 'right' | 'left';
  note?: string;
}

export interface ManifestSwing extends SelectionEntry {
  clip: string;
  angle: CameraAngle;
  frameCount: number;
  frameSha256: string[];
}

export interface Manifest {
  version: 1;
  frozenAt: string;
  rulesHash: string;
  ruleIds: string[];
  swings: ManifestSwing[];
}

export const SWING_COUNT_MIN = 30;
export const SWING_COUNT_MAX = 50;

/**
 * Bygger manifestet. Hårda fel: dubbletter, saknade bildrutor, fel vinkel, antal utanför
 * 30–50 (BACKLOG V-1). Varningar (fryser ändå): bara en vinkel, en spelare, en nivå —
 * det är facit som blir svagare, inte manifestet som blir fel.
 */
export function buildManifest(
  selection: readonly SelectionEntry[],
  framesById: ReadonlyMap<string, FramesFile>,
  rules: readonly Rule[],
  frozenAt: string,
): { manifest: Manifest; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const swings: ManifestSwing[] = [];
  for (const s of selection) {
    if (ids.has(s.id)) errors.push(`dubblett i urvalet: ${s.id}`);
    ids.add(s.id);
    if (!s.player) errors.push(`${s.id}: player saknas`);
    if (!s.level) errors.push(`${s.id}: level saknas`);
    const f = framesById.get(s.id);
    if (!f) {
      errors.push(`${s.id}: ingen bildrutefil`);
      continue;
    }
    if (f.angle !== 'dtl' && f.angle !== 'face-on') errors.push(`${s.id}: okänd vinkel ${String(f.angle)}`);
    if (!f.frames?.length) errors.push(`${s.id}: inga bildrutor`);
    swings.push({ ...s, clip: f.clip, angle: f.angle, frameCount: f.frames?.length ?? 0, frameSha256: (f.frames ?? []).map(frameSha256) });
  }
  if (selection.length < SWING_COUNT_MIN || selection.length > SWING_COUNT_MAX) {
    errors.push(`urvalet har ${selection.length} svingar, ska vara ${SWING_COUNT_MIN}–${SWING_COUNT_MAX}`);
  }
  if (errors.length) throw new Error(`manifestet fryses inte:\n- ${errors.join('\n- ')}`);
  const angles = new Set(swings.map((s) => s.angle));
  if (angles.size < 2) warnings.push(`bara vinkeln ${[...angles].join()} — skaftreglerna för den andra vinkeln får inget facit`);
  if (new Set(swings.map((s) => s.player)).size < 2) warnings.push('bara en spelare');
  if (new Set(swings.map((s) => s.level)).size < 2) warnings.push('bara en nivå');
  return {
    manifest: { version: 1, frozenAt, rulesHash: rulesHash(rules), ruleIds: rules.map((r) => r.id), swings },
    warnings,
  };
}

/** Avvikelser mellan manifest och bildrutor/regler på disk; tom lista = verifierat. */
export function verifyManifest(
  manifest: Manifest,
  framesById: ReadonlyMap<string, FramesFile>,
  rules: readonly Rule[],
): string[] {
  const problems: string[] = [];
  if (manifest.rulesHash !== rulesHash(rules)) {
    problems.push('reglerna har ändrats sedan frysningen (rulesHash) — facit gäller andra regeltexter');
  }
  for (const s of manifest.swings) {
    const f = framesById.get(s.id);
    if (!f) {
      problems.push(`${s.id}: bildrutefil saknas`);
      continue;
    }
    if (f.angle !== s.angle) problems.push(`${s.id}: vinkel ${f.angle} ≠ manifestets ${s.angle}`);
    if (f.frames.length !== s.frameCount) problems.push(`${s.id}: ${f.frames.length} bildrutor ≠ manifestets ${s.frameCount}`);
    f.frames.forEach((fr, i) => {
      if (s.frameSha256[i] !== undefined && frameSha256(fr) !== s.frameSha256[i]) problems.push(`${s.id}: bildruta ${i} har annan sha256`);
    });
  }
  return problems;
}

// ── Facit (CSV) ─────────────────────────────────────────────────────────────
//
// Semikolon som avgränsare: svensk Excel öppnar då filen i kolumner direkt. Parsern tar
// även komma, vald ur rubrikraden, om filen sparats om av ett annat verktyg.

export const FACIT_COLUMNS = ['swing_id', 'angle', 'rule_id', 'rule_title', 'phase', 'verdict', 'note'] as const;

function csvField(v: string, sep: string): string {
  return /["\r\n]/.test(v) || v.includes(sep) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** UTF-8-BOM: får svensk Excel att läsa å/ä/ö rätt. Som kod, inte som osynligt tecken i källan. */
export const BOM = String.fromCharCode(0xfeff);

export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0];
  const sep = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** Tom facit-mall: en rad per sving × regel som gäller svingens vinkel. */
export function facitTemplateCsv(manifest: Manifest, rules: readonly Rule[]): string {
  const sep = ';';
  const lines = [FACIT_COLUMNS.join(sep)];
  for (const s of manifest.swings) {
    for (const r of rulesForAngle(rules, s.angle)) {
      lines.push([s.id, s.angle, r.id, r.title, r.phase, '', ''].map((v) => csvField(v, sep)).join(sep));
    }
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Läser och validerar ett ifyllt facit mot manifestet. Varje (sving, regel) som mallen
 * innehåller ska ha exakt en rad med pass/fail/cannot_determine; inga andra rader.
 * `allowEmpty` släpper igenom tomma domar (för att se hur långt ifyllningen kommit).
 */
export function parseFacit(
  csv: string,
  manifest: Manifest,
  rules: readonly Rule[],
  options: { allowEmpty?: boolean } = {},
): { rows: FacitRow[]; errors: string[]; empty: number } {
  const [header, ...body] = parseCsv(csv);
  const errors: string[] = [];
  const col = (name: string) => header?.indexOf(name) ?? -1;
  const [iSwing, iRule, iVerdict] = [col('swing_id'), col('rule_id'), col('verdict')];
  if (iSwing < 0 || iRule < 0 || iVerdict < 0) {
    return { rows: [], errors: ['rubrikraden saknar swing_id, rule_id eller verdict'], empty: 0 };
  }
  const expected = new Set<string>();
  for (const s of manifest.swings) for (const r of rulesForAngle(rules, s.angle)) expected.add(`${s.id}|${r.id}`);

  const rows: FacitRow[] = [];
  const seen = new Set<string>();
  let empty = 0;
  body.forEach((cells, i) => {
    const line = i + 2;
    const swingId = (cells[iSwing] ?? '').trim();
    const ruleId = (cells[iRule] ?? '').trim();
    const raw = (cells[iVerdict] ?? '').trim().toLowerCase();
    const k = `${swingId}|${ruleId}`;
    if (!expected.has(k)) { errors.push(`rad ${line}: ${swingId} × ${ruleId} finns inte i manifestet/regeluppsättningen`); return; }
    if (seen.has(k)) { errors.push(`rad ${line}: dubblett ${swingId} × ${ruleId}`); return; }
    seen.add(k);
    if (raw === '') { empty++; if (!options.allowEmpty) errors.push(`rad ${line}: ${swingId} × ${ruleId} saknar dom`); return; }
    if (!VERDICTS.includes(raw as Verdict)) { errors.push(`rad ${line}: ogiltig dom "${raw}" (pass/fail/cannot_determine)`); return; }
    rows.push({ swingId, ruleId, verdict: raw as Verdict });
  });
  for (const k of expected) if (!seen.has(k)) errors.push(`saknar rad: ${k.replace('|', ' × ')}`);
  return { rows, errors, empty };
}

// ── Budget ──────────────────────────────────────────────────────────────────

/**
 * Prislistan i packages/core/src/lib/api.ts (CLAUDE_SONNET_4_5_PRICING, "Priser 2026-08,
 * verifiera vid modellbyte"). Kopierad hit eftersom api.ts inte exporterar den och core
 * inte ska röras i den här uppgiften.
 * OSÄKER: inte kontrollerad mot Anthropics aktuella prislista; den är den appen själv
 * räknar med, så uppskattning och appens kostnadslogg stämmer överens. Risk: låg — fel
 * pris ändrar budgeten, inte facit.
 */
export const SONNET_4_5_PRICING: Pricing = {
  inputPerMillionTokens: 3.0,
  outputPerMillionTokens: 15.0,
  cacheWritePerMillionTokens: 3.75,
  cacheReadPerMillionTokens: 0.3,
};

/**
 * Tokenmodell per anrop, ur S-48 (docs/vision-max-tokens/README.md), quick-läge, 7 DTL-
 * regler, 23–28 bildrutor:
 *   - kostnad per anrop $0,027–0,041 (avsnitt "Kostnad"), output 639–757 tokens (§3).
 *     Input-sidan (bilder, prompt, cache) = kostnad − output·$15/M ≈ $0,0174–0,0296.
 *   - output: huvud ~90, per regel 65 (pass) – 115 (fail), svans 40–85 (§1, tabell 2).
 * Fler regler än 7 lägger till regeltext i prompten.
 * OSÄKER: ~80 input-tokens per extra regel är uppskattat ur regeltexternas längd (titel,
 * beskrivning, övningar), inte uppmätt. Risk: låg — 6 extra regler ≈ $0,0014 per anrop.
 * OSÄKER: S-48 hade 23–28 bildrutor per sving; urvalet kan ha upp till 32
 * (ANALYSIS_FRAME_COUNT). Risk: input-sidan kan bli ~15 % högre; marginalen i
 * budgetförslaget täcker det.
 */
export const S48_TOKEN_MODEL = {
  baselineRules: 7,
  inputSideUsd: { low: 0.0174, high: 0.0296 },
  inputTokensPerExtraRule: 80,
  outputHeader: { low: 90, high: 90 },
  outputPerRule: { low: 65, high: 115 },
  outputTail: { low: 40, high: 85 },
} as const;

export interface BudgetEstimate {
  swings: number;
  runs: number;
  calls: number;
  perCallUsd: { low: number; high: number };
  totalUsd: { low: number; high: number };
}

export function estimateBudget(
  swingAngles: readonly CameraAngle[],
  runs: number,
  rules: readonly Rule[],
  pricing: Pricing = SONNET_4_5_PRICING,
  model = S48_TOKEN_MODEL,
): BudgetEstimate {
  let low = 0;
  let high = 0;
  const per = (n: number, b: 'low' | 'high') => {
    const extra = Math.max(0, n - model.baselineRules) * model.inputTokensPerExtraRule * pricing.inputPerMillionTokens / 1e6;
    const out = (model.outputHeader[b] + n * model.outputPerRule[b] + model.outputTail[b]) * pricing.outputPerMillionTokens / 1e6;
    return model.inputSideUsd[b] + extra + out;
  };
  for (const a of swingAngles) {
    const n = rulesForAngle(rules, a).length;
    low += per(n, 'low');
    high += per(n, 'high');
  }
  const k = swingAngles.length || 1;
  return {
    swings: swingAngles.length,
    runs,
    calls: swingAngles.length * runs,
    perCallUsd: { low: low / k, high: high / k },
    totalUsd: { low: low * runs, high: high * runs },
  };
}

// ── Körspärren ──────────────────────────────────────────────────────────────

export type Gate =
  | { mode: 'dry-run'; reason: string }
  | { mode: 'refuse'; reason: string }
  | { mode: 'live'; approvedUsd: number };

/**
 * Dry-run är standard. Riktiga anrop bara med `--approved-budget=<USD>` som täcker
 * uppskattningens övre gräns. Under körningen stoppar `runEval` dessutom innan ett anrop
 * som kunde ta den faktiska kostnaden över det godkända beloppet.
 */
export function runGate(args: readonly string[], estimate: BudgetEstimate): Gate {
  const flag = args.find((a) => a.startsWith('--approved-budget'));
  if (!flag) return { mode: 'dry-run', reason: 'ingen --approved-budget=<USD>: dry-run, inget skickas' };
  const m = /^--approved-budget=(\d+(?:\.\d+)?)$/.exec(flag);
  if (!m) return { mode: 'refuse', reason: `ogiltig flagga ${flag} (format: --approved-budget=8 eller =7.50)` };
  const approved = Number(m[1]);
  if (!(approved > 0)) return { mode: 'refuse', reason: 'godkänd budget måste vara > 0' };
  if (approved < estimate.totalUsd.high) {
    return { mode: 'refuse', reason: `godkänt $${approved.toFixed(2)} < uppskattat högst $${estimate.totalUsd.high.toFixed(2)} — be Erik om ny budget` };
  }
  return { mode: 'live', approvedUsd: approved };
}

// ── Körningen ───────────────────────────────────────────────────────────────

export interface CallLogEntry {
  sentAt: string;
  tag: string;
  swingId: string;
  k: number;
  userId: string;
}

/** Märkningen i metadata.user_id, som S-48 ("s48-test-…"): syns i Anthropics användningslogg. */
export function evalUserId(tag: string, swingId: string, k: number): string {
  return `v1-eval-${tag}-${swingId}-k${k}`;
}

export interface PlannedCall {
  swingId: string;
  angle: CameraAngle;
  k: number;
}

/** Svingarna i manifestordning, körning 1 för alla först (så att ett avbrott ger jämna data). */
export function planCalls(manifest: Manifest, runs: number, done: ReadonlySet<string> = new Set()): PlannedCall[] {
  const out: PlannedCall[] = [];
  for (let k = 1; k <= runs; k++) {
    for (const s of manifest.swings) if (!done.has(`${s.id}#${k}`)) out.push({ swingId: s.id, angle: s.angle, k });
  }
  return out;
}

export interface AnalyzeOutcome {
  wallMs: number | null;
  usage: UsageRecord | null;
  analysis: { rules: ModelRuleResult[] } | null;
  error?: string;
  stopReason?: string | null;
}

/**
 * Kör planen sekventiellt. `analyze` är transporten (puppeteer-sidan i v1.ts, en mock i
 * testerna). Spärrar, i ordning före varje anrop:
 *   1. antalet redan skickade anrop (calls.jsonl, även från tidigare avbrutna körningar)
 *      får inte nå `maxCalls` (= svingar × körningar, planens storlek),
 *   2. faktisk kostnad hittills + uppskattat högsta per anrop får inte passera `approvedUsd`.
 * Anropet loggas (`logCall`) INNAN det skickas, som i S-48. Inget automatiskt återförsök:
 * ett misslyckat anrop är betalt och blir en rad med `error`.
 */
export async function runEval(opts: {
  plan: readonly PlannedCall[];
  tag: string;
  maxCalls: number;
  alreadySent: number;
  spentUsd: number;
  approvedUsd: number;
  perCallHighUsd: number;
  pricing: Pricing;
  analyze: (call: PlannedCall, userId: string) => Promise<AnalyzeOutcome>;
  logCall: (entry: CallLogEntry) => void;
  logResult: (result: PlannedCall & AnalyzeOutcome & { tag: string; userId: string }) => void;
  now?: () => string;
}): Promise<{ sent: number; spentUsd: number; stopped: string | null }> {
  let sent = opts.alreadySent;
  let spent = opts.spentUsd;
  const now = opts.now ?? (() => new Date().toISOString());
  for (const call of opts.plan) {
    if (sent >= opts.maxCalls) return { sent, spentUsd: spent, stopped: `taket ${opts.maxCalls} anrop nått` };
    if (spent + opts.perCallHighUsd > opts.approvedUsd) {
      return { sent, spentUsd: spent, stopped: `nästa anrop kunde passera godkänt $${opts.approvedUsd.toFixed(2)} (hittills $${spent.toFixed(2)})` };
    }
    const userId = evalUserId(opts.tag, call.swingId, call.k);
    opts.logCall({ sentAt: now(), tag: opts.tag, swingId: call.swingId, k: call.k, userId });
    sent++;
    const outcome = await opts.analyze(call, userId);
    if (outcome.usage) spent += costUsd(outcome.usage, opts.pricing);
    opts.logResult({ ...call, ...outcome, tag: opts.tag, userId });
  }
  return { sent, spentUsd: spent, stopped: null };
}

/**
 * Node-sidan av transporten: märker anropet och skickar det till Workern. Sidans
 * window.fetch lämnar över anropet hit (v1.ts), som i S-48:s measure.cjs.
 */
export async function postTagged(
  fetchImpl: typeof fetch,
  url: string,
  bodyText: string,
  userId: string,
  origin: string,
): Promise<{ status: number; text: string }> {
  const body = JSON.parse(bodyText);
  body.metadata = { user_id: userId };
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}
