// ONE-OFF (S-45 steg 3): can Vision tell "ball struck" on the 81 swings with known answers?
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/practice-review/vision_ball.cjs frames <clipDir> <outDir> [baseUrl]
//   node docs/shaft/practice-review/vision_ball.cjs call   <outDir> <variant> <quick|detailed> <ids|all> [baseUrl]
//
// `frames` costs nothing: per clip, production's chain in the dev app (extractPoseTrajectory →
// readTimeStretch → detectSessionSwings), then for each accepted swing exactly what the session
// path (useSessionCapture.runSwing) does before Vision: selectEnvelopeFrames over the envelope
// with the rules' cluster phases, computeLandmarkBounds over the envelope (liveSwingDetector),
// grabFramesAtTimes at FRAME_QUALITY 0.8 with the E-2 crop and MAX_OUTPUT_SIDE.
//
// `call` is PAID. The page calls the app's own analyzeSwing (same SYSTEM_PROMPT, buildSwingPrompt,
// cache breakpoints, parse). Only its transport is replaced: window.fetch hands the request to Node,
// which (1) for variant `ball` inserts the locked ball_struck question (vision-ball.md) into the
// schema, (2) tags it with metadata.user_id, and (3) posts it to the Worker with Origin
// http://localhost:5173 — the dev origin on the Worker's allowlist, whose port is taken locally by
// another project. Every POST is appended to <outDir>/calls.jsonl BEFORE it is sent, and the run
// refuses to send once that file holds BUDGET entries.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BUDGET = 90; // approved by Erik for all of S-45 steg 3, reruns included
const ORIGIN = 'http://localhost:5173';
const TAG = 's45-vision-ball';
// Production defaults (settings.ts): cameraAngle 'dtl', focusRuleId null. Schema mode is an
// argument: 'quick' (default ttsEnabled + ttsMode 'quick') or 'detailed' (TTS off or 'detailed').
// The run was planned in quick mode; quick + 7 rules hit max_tokens 600 before the question,
// so Erik moved it to detailed (vision-ball.md, "Avvikelse").
// Rules: every library rule that matches DTL (Erik's choice, 2026-10-22).
const ANGLE = 'dtl';

// ── The locked question (vision-ball.md, "Frågan, låst före körning") ─────────────
// The schema line the fields go in front of, per mode (prompt.ts).
const SCHEMA_ANCHORS = {
  quick: '\n  "overall_assessment": "max one sentence",',
  detailed: '\n  "overall_assessment": "2-3 sentence summary",',
};
const SCHEMA_INSERT =
  '\n  "ball_struck": "yes" | "no" | "unclear",' +
  '\n  "ball_struck_reason": "max one short phrase",';
const INSTRUCTION_ANCHOR = '\n\nCONFIDENCE CALIBRATION:';
const INSTRUCTION_INSERT =
  '\n\nBALL STRUCK (separate from the rules, never changes a rule verdict):' +
  '\nJudge whether this swing struck a golf ball.' +
  '\n- "yes": a ball is visible at address and is gone or moving after the club has passed it.' +
  '\n- "no": no ball was struck — no ball is visible at address, or the ball is still lying in place after the club has passed (a practice swing).' +
  '\n- "unclear": the frames do not show the ball area clearly enough at address and after impact to tell. Do not guess.' +
  '\nball_struck_reason is written in Swedish, like every other free-text field.';

function addBallQuestion(body, mode) {
  const block = body.messages[0].content[0];
  let text = block.text;
  for (const [anchor, insert] of [[SCHEMA_ANCHORS[mode], SCHEMA_INSERT], [INSTRUCTION_ANCHOR, INSTRUCTION_INSERT]]) {
    if (text.split(anchor).length !== 2) throw new Error(`anchor not found exactly once: ${JSON.stringify(anchor)}`);
    text = text.replace(anchor, insert + anchor);
  }
  block.text = text;
}

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'frames') return framesMode(...rest);
  if (mode === 'call') return callMode(...rest);
  throw new Error('usage: vision_ball.cjs frames <clipDir> <outDir> | call <outDir> <variant> <ids|all>');
})().catch((e) => { console.error(e); process.exit(1); });

async function openPage(baseUrl) {
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1800000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1800000);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  return { browser, page };
}

async function framesMode(clipDir, outDir, baseUrl = 'http://localhost:5199/') {
  const key = JSON.parse(fs.readFileSync(path.join(outDir, '..', 'key.json'), 'utf8')).key;
  const frameDir = path.join(outDir, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });
  const byClip = new Map();
  for (const k of key) byClip.set(k.clip, [...(byClip.get(k.clip) ?? []), k]);
  const { browser, page } = await openPage(baseUrl);
  for (const [clip, ks] of byClip) {
    if (ks.every((k) => fs.existsSync(path.join(frameDir, `${k.id}.json`)))) continue;
    await page.evaluate(() => {
      document.getElementById('__s45')?.remove();
      const input = document.createElement('input');
      input.type = 'file';
      input.id = '__s45';
      document.body.appendChild(input);
    });
    await (await page.$('#__s45')).uploadFile(path.resolve(clipDir, clip));
    const swings = await page.evaluate(async (angle) => {
      const file = document.getElementById('__s45').files[0];
      const { extractPoseTrajectory } = await import('/src/lib/poseTrajectory.ts');
      const { readTimeStretch } = await import('/src/lib/mp4Probe.ts');
      const { detectSessionSwings } = await import('/src/lib/poseSegments.ts');
      const { selectEnvelopeFrames } = await import('/src/lib/poseEnvelopeSelection.ts');
      const { computeLandmarkBounds, MAX_OUTPUT_SIDE } = await import('/src/lib/poseCropBox.ts');
      const { grabFramesAtTimes } = await import('/src/lib/poseFrameGrab.ts');
      const { ANALYSIS_FRAME_COUNT } = await import('/src/lib/frameExtractor.ts');
      const { RULE_LIBRARY } = await import('/src/data/ruleLibrary.ts');
      const { ruleMatchesAngle } = await import('/src/lib/cameraAngle.ts');
      const rules = RULE_LIBRARY.filter((r) => ruleMatchesAngle(r, angle));
      // useSessionCapture.rulePhasesToSwingPhases (module-private, copied verbatim).
      const clusterPhases = rules.map((r) => (r.phase === 'follow' ? 'follow-through' : r.phase));
      const samples = await extractPoseTrajectory(file);
      const stretch = await readTimeStretch(file);
      const session = detectSessionSwings(samples, { timeStretched: stretch.timeStretched });
      const out = [];
      for (const s of session.swings) {
        const e = s.envelope;
        const sel = selectEnvelopeFrames(e, ANALYSIS_FRAME_COUNT, e.startSec, e.finishSec, { clusterPhases });
        const times = sel.picks.map((p) => p.t);
        const { frames, crop } = await grabFramesAtTimes(file, times, 0.8, {
          cropBounds: computeLandmarkBounds(samples, e.startSec, e.finishSec),
          maxOutputSide: MAX_OUTPUT_SIDE,
        });
        out.push({
          envStartSec: e.startSec,
          impact: e.impact !== null,
          times,
          phases: sel.picks.map((p) => p.phase),
          crop,
          frames,
        });
      }
      return out;
    }, ANGLE);
    for (const k of ks) {
      const m = swings.filter((s) => Math.abs(s.envStartSec - k.envStartSec) < 1e-6);
      if (m.length !== 1) throw new Error(`${k.id} ${clip}: no unique envelope match`);
      fs.writeFileSync(path.join(frameDir, `${k.id}.json`), JSON.stringify({ id: k.id, clip, ...m[0] }));
    }
    console.log(`${clip}: ${ks.map((k) => k.id).join(' ')} (${swings[0]?.frames.length ?? 0} frames, crop ${swings[0]?.crop.reason ?? swings[0]?.crop.output?.width + 'x' + swings[0]?.crop.output?.height})`);
  }
  await browser.close();
}

async function callMode(outDir, variant, mode, which, baseUrl = 'http://localhost:5199/') {
  if (!['ball', 'base'].includes(variant)) throw new Error('variant must be ball or base');
  if (!['quick', 'detailed'].includes(mode)) throw new Error('mode must be quick or detailed');
  const QUICK = mode === 'quick';
  const callsFile = path.join(outDir, 'calls.jsonl');
  const resultFile = path.join(outDir, `results-${variant}-${mode}.jsonl`);
  const sent = () => (fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  const done = new Set(
    fs.existsSync(resultFile)
      ? fs.readFileSync(resultFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => `${r.id}#${r.rep}`)
      : [],
  );
  const frameDir = path.join(outDir, 'frames');
  const all = fs.readdirSync(frameDir).map((f) => f.replace('.json', '')).sort();
  const jobs = (which === 'all' ? all.map((id) => `${id}#1`) : which.split(','))
    .map((j) => (j.includes('#') ? j : `${j}#1`))
    .filter((j) => !done.has(j));

  const { browser, page } = await openPage(baseUrl);
  let current = null;
  await page.exposeFunction('__s45post', async (url, bodyText) => {
    if (sent() >= BUDGET) throw new Error(`budget: ${BUDGET} calls already sent — stopping`);
    const body = JSON.parse(bodyText);
    if (variant === 'ball') addBallQuestion(body, mode);
    body.metadata = { user_id: `${TAG}-${variant}-${mode}-${current}` };
    const sentAt = new Date().toISOString();
    fs.appendFileSync(callsFile, JSON.stringify({ sentAt, job: current, variant, mode, url }) + '\n');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    fs.writeFileSync(path.join(outDir, 'raw', `${variant}-${mode}-${current.replace('#', '_')}.json`), JSON.stringify({ sentAt, status: res.status, prompt: body.messages[0].content[0].text, response: text }));
    return { status: res.status, text };
  });
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  await page.evaluate(() => {
    const orig = window.fetch;
    window.fetch = async (url, init) => {
      // api.ts posts to VITE_API_URL (the Worker root); the logger posts to …/log.
      if (init?.method !== 'POST' || /\/log$/.test(String(url)) || !String(init.body).includes('"messages"')) {
        return orig(url, init);
      }
      const { status, text } = await window.__s45post(String(url), init.body);
      return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
    };
  });

  for (const job of jobs) {
    const [id, rep] = job.split('#');
    if (sent() >= BUDGET) { console.log(`budget reached (${BUDGET}) — stopping before ${job}`); break; }
    current = job;
    const f = JSON.parse(fs.readFileSync(path.join(frameDir, `${id}.json`), 'utf8'));
    const t0 = Date.now();
    const r = await page.evaluate(async (frames, angle, quick) => {
      const { analyzeSwing } = await import('/src/lib/api.ts');
      const { RULE_LIBRARY } = await import('/src/data/ruleLibrary.ts');
      const { ruleMatchesAngle, ANGLE_TO_PROMPT } = await import('/src/lib/cameraAngle.ts');
      // As rules.ts addFromLibrary builds them, with stable ids instead of uuid().
      const rules = RULE_LIBRARY.filter((r) => ruleMatchesAngle(r, angle)).map((l) => ({
        id: `r-${l.id}`, title: l.title, description: l.description, phase: l.phase, weight: l.weight,
        active: true, angles: l.angles, libraryId: l.id, drills: l.drills,
      }));
      let usage = null;
      try {
        const analysis = await analyzeSwing(frames, rules, {
          cameraAngle: ANGLE_TO_PROMPT[angle],
          quickMode: quick,
          onUsage: (u) => { usage = u; },
        });
        return { analysis, usage };
      } catch (e) {
        return { error: String(e?.message ?? e), usage };
      }
    }, f.frames, ANGLE, QUICK);
    fs.appendFileSync(resultFile, JSON.stringify({ id, rep: Number(rep), variant, mode, ms: Date.now() - t0, ...r }) + '\n');
    const b = r.analysis?.ball_struck ?? (r.error ? 'ERROR' : '—');
    console.log(`${job} ${variant}/${mode}: ${b} | in ${r.usage?.inputTokens} out ${r.usage?.outputTokens} cr ${r.usage?.cacheReadTokens} cw ${r.usage?.cacheCreationTokens} | sent ${sent()}/${BUDGET}${r.error ? ' | ' + r.error.slice(0, 120) : ''}`);
  }
  await browser.close();
}
