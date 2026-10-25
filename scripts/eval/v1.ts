// V-1 — facit för domkvalitet. Kommandoradsverktyget; flödet står i docs/eval/v1-facit.md.
//
//   node scripts/eval/v1.ts extract <klippmapp> <dtl|face-on> [baseUrl]   gratis, kräver npm run dev
//   node scripts/eval/v1.ts selection-template                            gratis
//   node scripts/eval/v1.ts freeze                                        gratis
//   node scripts/eval/v1.ts verify                                        gratis
//   node scripts/eval/v1.ts facit-template                                gratis
//   node scripts/eval/v1.ts facit-check [--allow-empty]                   gratis
//   node scripts/eval/v1.ts budget [--swings=40] [--dtl=20] [--runs=3]    gratis
//   node scripts/eval/v1.ts run [--tag=baseline] [--runs=3] [--approved-budget=<USD>] [--base=<url>]
//   node scripts/eval/v1.ts score [--tag=baseline] [--runs=3]             gratis
//
// `run` är dry-run tills `--approved-budget=<USD>` ges, och vägrar även då om beloppet
// understiger uppskattningens övre gräns (runGate i v1-lib.ts). Då — och bara då — är det
// BETALT: sidan i `npm run dev` kör appens egen analyzeSwing (SYSTEM_PROMPT,
// buildSwingPrompt, cache, max_tokens, parsning) med eval-reglerna. Bara transporten byts:
// window.fetch lämnar anropet till Node, som märker det (metadata.user_id "v1-eval-…"),
// loggar det i calls.jsonl FÖRE sändning och postar det till Workern, som S-48:s measure.cjs.
//
// Körs med Node ≥ 22.18 (typstrippning). Puppeteer laddas bara av `extract` och live-`run`.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CameraAngle } from '@swingcheck/core/lib/cameraAngle';
import type { Rule } from '@swingcheck/core/types';
import { V1_RULES } from './v1-rules.ts';
import {
  SONNET_4_5_PRICING,
  buildManifest,
  estimateBudget,
  facitTemplateCsv,
  parseFacit,
  planCalls,
  postTagged,
  rulesForAngle,
  runEval,
  runGate,
  sha256,
  verifyManifest,
  type AnalyzeOutcome,
  type FramesFile,
  type Manifest,
  type SelectionEntry,
} from './v1-lib.ts';
import { costUsd, renderScoreMarkdown, scoreRuns, type RunResult } from './v1-score.ts';

const RAW = 'data/eval/v1'; // gitignorerat: bildrutor och rådata
const FRAMES = path.join(RAW, 'frames');
const SELECTION = path.join(RAW, 'selection.json');
const MANIFEST = 'docs/eval/v1/manifest.json'; // committas: id, metadata, sha256
const FACIT = 'docs/eval/v1/facit.csv'; // committas: Eriks domar
const DEFAULT_BASE = 'http://localhost:5199/';
// Devursprunget på Workerns tillåtelselista (porten är upptagen lokalt, därav 5199 ovan).
const ORIGIN = 'http://localhost:5173';
// Appens standard i sessionen (ttsEnabled + ttsMode 'quick', useSessionCapture.ts).
// OSÄKER: detaljerat läge mäts inte i baslinjen. 13 regler ger där taket 400 + 250·13 = 3650,
// över Workerns 2000 om den inte är deployad med 4096 (S-48 §2) → klippning. Risk: baslinjen
// säger inget om detaljerade svar; görs i så fall som en egen körning med egen budget.
const QUICK_MODE = true;

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const readJsonl = <T>(p: string): T[] =>
  existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T) : [];

function loadFrames(): Map<string, FramesFile> {
  const m = new Map<string, FramesFile>();
  if (!existsSync(FRAMES)) return m;
  for (const f of readdirSync(FRAMES).filter((x) => x.endsWith('.json'))) {
    const ff = readJson<FramesFile>(path.join(FRAMES, f));
    m.set(ff.id, ff);
  }
  return m;
}

function refuseOverwrite(p: string) {
  if (existsSync(p)) throw new Error(`${p} finns redan — fryst fil skrivs inte över. Ta bort den medvetet om urvalet ska göras om.`);
}

function maxTokensQuick(n: number) {
  // Spegling av maxTokensFor(true, n) i api.ts, bara för utskriften.
  return Math.min(200 + 120 * n, 4096);
}

function printBudget(angles: CameraAngle[], runs: number) {
  const e = estimateBudget(angles, runs, V1_RULES);
  const dtl = angles.filter((a) => a === 'dtl').length;
  console.log(`svingar ${e.swings} (DTL ${dtl}, face-on ${e.swings - dtl}) × ${runs} körningar = ${e.calls} anrop`);
  for (const a of ['dtl', 'face-on'] as const) {
    const n = rulesForAngle(V1_RULES, a).length;
    console.log(`  ${a}: ${n} regler, max_tokens ${maxTokensQuick(n)} (quick)`);
  }
  console.log(`per anrop $${e.perCallUsd.low.toFixed(3)}–${e.perCallUsd.high.toFixed(3)}, totalt $${e.totalUsd.low.toFixed(2)}–${e.totalUsd.high.toFixed(2)} (claude-sonnet-4-5, S-48:s tokenmodell)`);
  return e;
}

// ── Kommandon ───────────────────────────────────────────────────────────────

async function extract(clipDir: string, angle: CameraAngle, baseUrl = DEFAULT_BASE) {
  if (angle !== 'dtl' && angle !== 'face-on') throw new Error('vinkel: dtl eller face-on');
  mkdirSync(FRAMES, { recursive: true });
  const rules = rulesForAngle(V1_RULES, angle);
  const clips = readdirSync(clipDir).filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f));
  const { browser, page } = await openPage(baseUrl);
  try {
    for (const clip of clips) {
      const stem = path.parse(clip).name.replace(/[^A-Za-z0-9_-]+/g, '_');
      await page.evaluate(() => {
        document.getElementById('__v1')?.remove();
        const input = document.createElement('input');
        input.type = 'file';
        input.id = '__v1';
        document.body.appendChild(input);
      });
      const input = await page.$('#__v1');
      if (!input) throw new Error('filfältet saknas i sidan');
      await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(path.resolve(clipDir, clip));
      // Produktionens kedja, som S-45 steg 3 (vision_ball.cjs `frames`), med sökvägarna efter
      // core-splitten. Sessionsvägen (useSessionCapture.runSwing) före Vision:
      // selectEnvelopeFrames med reglernas faser, computeLandmarkBounds över envelopen,
      // grabFramesAtTimes med kvalitet 0,8, E-2-beskärning och MAX_OUTPUT_SIDE.
      // OSÄKER: inte körd i den här miljön (inga klipp, ingen Chromium). Risk: en flyttad
      // import ger ett tydligt fel i sidan, inte fel bildrutor — men kör en sving och jämför
      // bildrutorna mot appen innan hela urvalet extraheras.
      const swings = await page.evaluate(async (phases: string[]) => {
        const file = (document.getElementById('__v1') as HTMLInputElement).files![0];
        // Sökvägar som dev-servern serverar; via en variabel så att tsc inte försöker lösa dem.
        const load = (p: string) => import(/* @vite-ignore */ p);
        const { extractPoseTrajectory } = await load('/src/lib/poseTrajectory.ts');
        const { grabFramesAtTimes } = await load('/src/lib/poseFrameGrab.ts');
        const { ANALYSIS_FRAME_COUNT } = await load('/src/lib/frameExtractor.ts');
        const { readTimeStretch } = await load('/packages/core/src/lib/mp4Probe.ts');
        const { detectSessionSwings } = await load('/packages/core/src/lib/poseSegments.ts');
        const { selectEnvelopeFrames } = await load('/packages/core/src/lib/poseEnvelopeSelection.ts');
        const { computeLandmarkBounds, MAX_OUTPUT_SIDE } = await load('/packages/core/src/lib/poseCropBox.ts');
        // useSessionCapture.rulePhasesToSwingPhases (modulprivat, kopierad ordagrant).
        const clusterPhases = phases.map((p) => (p === 'follow' ? 'follow-through' : p));
        const samples = await extractPoseTrajectory(file);
        const stretch = await readTimeStretch(file);
        const session = detectSessionSwings(samples, { timeStretched: stretch.timeStretched });
        const out = [];
        for (const s of session.swings) {
          const e = s.envelope;
          const sel = selectEnvelopeFrames(e, ANALYSIS_FRAME_COUNT, e.startSec, e.finishSec, { clusterPhases });
          const times = sel.picks.map((p: { t: number }) => p.t);
          const { frames, crop } = await grabFramesAtTimes(file, times, 0.8, {
            cropBounds: computeLandmarkBounds(samples, e.startSec, e.finishSec),
            maxOutputSide: MAX_OUTPUT_SIDE,
          });
          out.push({ envStartSec: e.startSec, impact: e.impact !== null, times, phases: sel.picks.map((p: { phase: string }) => p.phase), crop, frames });
        }
        return out;
      }, rules.map((r) => r.phase));
      swings.forEach((s, i) => {
        const id = `${stem}-s${String(i + 1).padStart(2, '0')}`;
        const file: FramesFile & Record<string, unknown> = { id, clip, angle, ...s };
        writeFileSync(path.join(FRAMES, `${id}.json`), JSON.stringify(file));
      });
      console.log(`${clip}: ${swings.length} svingar (${swings.map((s) => `${s.frames.length} rutor${s.impact ? '' : ', ingen impact'}`).join('; ')})`);
    }
  } finally {
    await browser.close();
  }
}

function selectionTemplate() {
  refuseOverwrite(SELECTION);
  const ids = [...loadFrames().values()].sort((a, b) => a.id.localeCompare(b.id));
  const swings: SelectionEntry[] = ids.map((f) => ({ id: f.id, player: '', level: '', handedness: 'right', note: `${f.angle}, ${f.frames.length} rutor` }));
  writeFileSync(SELECTION, JSON.stringify({ swings }, null, 2) + '\n');
  console.log(`${SELECTION}: ${swings.length} svingar. Stryk till 30–50, fyll i player (pseudonym) och level.`);
}

function freeze() {
  refuseOverwrite(MANIFEST);
  const { swings } = readJson<{ swings: SelectionEntry[] }>(SELECTION);
  const { manifest, warnings } = buildManifest(swings, loadFrames(), V1_RULES, new Date().toISOString());
  mkdirSync(path.dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  for (const w of warnings) console.warn(`varning: ${w}`);
  console.log(`${MANIFEST}: ${manifest.swings.length} svingar, rulesHash ${manifest.rulesHash.slice(0, 12)}…`);
}

function verify(): Manifest {
  const manifest = readJson<Manifest>(MANIFEST);
  const problems = verifyManifest(manifest, loadFrames(), V1_RULES);
  if (problems.length) throw new Error(`manifestet stämmer inte:\n- ${problems.join('\n- ')}`);
  const frames = manifest.swings.reduce((a, s) => a + s.frameCount, 0);
  console.log(`manifestet verifierat: ${manifest.swings.length} svingar, ${frames} bildrutor, regler oförändrade`);
  return manifest;
}

function facitTemplate() {
  refuseOverwrite(FACIT);
  const manifest = verify();
  writeFileSync(FACIT, facitTemplateCsv(manifest, V1_RULES));
  console.log(`${FACIT}: fyll i verdict (pass/fail/cannot_determine) per rad, utan att se modellens svar.`);
}

function facitCheck(allowEmpty: boolean) {
  const manifest = readJson<Manifest>(MANIFEST);
  const { rows, errors, empty } = parseFacit(readFileSync(FACIT, 'utf8'), manifest, V1_RULES, { allowEmpty });
  const counts = { pass: 0, fail: 0, cannot_determine: 0 };
  for (const r of rows) counts[r.verdict]++;
  console.log(`facit: ${rows.length} domar (pass ${counts.pass}, fail ${counts.fail}, cannot_determine ${counts.cannot_determine}), tomma ${empty}`);
  if (errors.length) throw new Error(`facit ogiltigt:\n- ${errors.slice(0, 30).join('\n- ')}${errors.length > 30 ? `\n… och ${errors.length - 30} till` : ''}`);
  return rows;
}

/** Förregistreringen: urval och facit ska vara committade och orörda innan något körs. */
function requireCommitted(files: string[]) {
  for (const f of files) {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', f], { stdio: 'ignore' });
    } catch {
      throw new Error(`${f} är inte committad — förregistrera urval och facit i en commit före första körningen`);
    }
  }
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...files], { stdio: 'ignore' });
  } catch {
    throw new Error(`${files.join(', ')} har ocommittade ändringar — facit får inte ändras efter förregistreringen`);
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function run() {
  const tag = opt('tag', 'baseline');
  const runs = Number(opt('runs', '3'));
  const baseUrl = opt('base', DEFAULT_BASE);
  if (!/^[a-z0-9-]+$/.test(tag)) throw new Error('--tag: a–z, 0–9, bindestreck');
  const manifest = readJson<Manifest>(MANIFEST);
  const estimate = printBudget(manifest.swings.map((s) => s.angle), runs);
  const gate = runGate(args, estimate);
  if (gate.mode !== 'live') {
    console.log(`${gate.mode === 'dry-run' ? 'DRY-RUN' : 'VÄGRAR'}: ${gate.reason}`);
    if (gate.mode === 'refuse') process.exitCode = 1;
    return;
  }

  verify();
  facitCheck(false);
  const commit = requireCommitted([MANIFEST, FACIT]);
  const dir = path.join(RAW, 'runs', tag);
  mkdirSync(dir, { recursive: true });
  const callsFile = path.join(dir, 'calls.jsonl');
  const resultsFile = path.join(dir, 'results.jsonl');
  const prior = readJsonl<RunResult>(resultsFile);
  const done = new Set(prior.map((r) => `${r.swingId}#${r.k}`));
  const plan = planCalls(manifest, runs, done);
  writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ tag, runs, commit, model: 'claude-sonnet-4-5', quickMode: QUICK_MODE, approvedUsd: gate.approvedUsd, estimate,
      manifestSha256: sha256(readFileSync(MANIFEST)), facitSha256: sha256(readFileSync(FACIT)), rulesHash: manifest.rulesHash, startedAt: new Date().toISOString() }, null, 2),
  );

  const framesById = loadFrames();
  const { browser, page } = await openPage(baseUrl);
  // Ett planerat anrop får skicka exakt en POST. Ett återförsök eller ett extra anrop i
  // appens kod kastar i stället för att tyst kosta.
  let armed: string | null = null;
  await page.exposeFunction('__v1post', async (url: string, bodyText: string) => {
    if (!armed) throw new Error('POST utanför planen — stoppad');
    const userId = armed;
    armed = null;
    return postTagged(fetch, new URL(url, baseUrl).href, bodyText, userId, ORIGIN);
  });
  await page.evaluate(() => {
    const w = window as unknown as { fetch: typeof fetch; __v1post(u: string, b: string): Promise<{ status: number; text: string }> };
    const orig = w.fetch.bind(window);
    w.fetch = async (url, init) => {
      if (init?.method !== 'POST' || /\/log$/.test(String(url)) || !String(init.body).includes('"messages"')) return orig(url, init);
      const { status, text } = await w.__v1post(String(url), String(init.body));
      return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
    };
  });

  const spentSoFar = prior.reduce((a, r) => a + (r.usage ? costUsd(r.usage, SONNET_4_5_PRICING) : 0), 0);
  try {
    const out = await runEval({
      plan,
      tag,
      maxCalls: manifest.swings.length * runs,
      alreadySent: readJsonl(callsFile).length,
      spentUsd: spentSoFar,
      approvedUsd: gate.approvedUsd,
      perCallHighUsd: estimate.perCallUsd.high,
      pricing: SONNET_4_5_PRICING,
      logCall: (e) => appendFileSync(callsFile, JSON.stringify(e) + '\n'),
      logResult: (r) => {
        appendFileSync(resultsFile, JSON.stringify(r) + '\n');
        const u = r.usage;
        console.log(`${r.swingId} k${r.k}: ${r.error ? 'FEL ' + r.error.slice(0, 80) : 'ok'} | ${r.wallMs ? (r.wallMs / 1000).toFixed(1) + ' s' : '–'} | in ${u?.inputTokens} out ${u?.outputTokens} cr ${u?.cacheReadTokens} cw ${u?.cacheCreationTokens}`);
      },
      analyze: async (call, userId): Promise<AnalyzeOutcome> => {
        const f = framesById.get(call.swingId)!;
        const rules: Rule[] = rulesForAngle(V1_RULES, call.angle);
        armed = userId;
        const r = await page.evaluate(
          async (frames: string[], rules: Rule[], angle: string, quick: boolean) => {
            // Samma modulinstans som appen konfigurerat i coreSetup.ts: Vite löser
            // @swingcheck/core (workspace-symlänk) till den här verkliga sökvägen.
            const load = (p: string) => import(/* @vite-ignore */ p);
            const { analyzeSwing } = await load('/packages/core/src/lib/api.ts');
            const { ANGLE_TO_PROMPT } = await load('/packages/core/src/lib/cameraAngle.ts');
            let usage = null;
            const t0 = performance.now();
            try {
              const analysis = await analyzeSwing(frames, rules, {
                cameraAngle: ANGLE_TO_PROMPT[angle as 'dtl' | 'face-on'],
                quickMode: quick,
                onUsage: (u: unknown) => { usage = u; },
              });
              return { analysis, usage, wallMs: performance.now() - t0 };
            } catch (e) {
              return { analysis: null, usage, wallMs: performance.now() - t0, error: `${(e as Error)?.name}: ${(e as Error)?.message ?? e}` };
            }
          },
          f.frames, rules, call.angle, QUICK_MODE,
        );
        armed = null;
        return r as AnalyzeOutcome;
      },
    });
    console.log(`skickade ${out.sent}, kostnad hittills $${out.spentUsd.toFixed(2)} av godkänt $${gate.approvedUsd.toFixed(2)}${out.stopped ? ` — STOPP: ${out.stopped}` : ''}`);
  } finally {
    await browser.close();
  }
}

function score() {
  const tag = opt('tag', 'baseline');
  const runs = Number(opt('runs', '3'));
  const facit = facitCheck(false);
  const dir = path.join(RAW, 'runs', tag);
  const results = readJsonl<RunResult>(path.join(dir, 'results.jsonl'));
  const s = scoreRuns(facit, results, { runs, pricing: SONNET_4_5_PRICING });
  writeFileSync(path.join(dir, 'score.json'), JSON.stringify(s, null, 2));
  console.log(renderScoreMarkdown(s, new Map(V1_RULES.map((r) => [r.id, r.title]))));
}

async function openPage(baseUrl: string) {
  // OSÄKER: puppeteer installeras med PUPPETEER_SKIP_DOWNLOAD=true i CI; lokalt behövs
  // Chromium (`npx puppeteer browsers install chrome`). Risk: ett startfel, inget annat.
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1_800_000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1_800_000);
  page.on('pageerror', (e) => console.error('pageerror', (e as Error).message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  return { browser, page };
}

const commands: Record<string, () => unknown> = {
  extract: () => extract(args[1], args[2] as CameraAngle, args[3]),
  'selection-template': selectionTemplate,
  freeze,
  verify,
  'facit-template': facitTemplate,
  'facit-check': () => facitCheck(args.includes('--allow-empty')),
  budget: () => {
    const n = Number(opt('swings', '40'));
    const dtl = Number(opt('dtl', String(Math.round(n / 2))));
    printBudget([...Array(dtl).fill('dtl'), ...Array(n - dtl).fill('face-on')], Number(opt('runs', '3')));
  },
  run,
  score,
};

const cmd = commands[args[0]];
if (!cmd) {
  console.error(`kommandon: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
Promise.resolve().then(cmd).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
