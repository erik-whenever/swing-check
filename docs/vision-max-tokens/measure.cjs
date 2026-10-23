// ONE-OFF (S-48): does Vision's answer hit max_tokens, per mode and rule count?
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/vision-max-tokens/measure.cjs <phase> <quick|detailed> <nRules> <ids> [baseUrl]
//
// PAID. The page calls the app's own analyzeSwing (SYSTEM_PROMPT, buildSwingPrompt, cache
// breakpoints, max_tokens, parse) on frames already extracted for S-45 steg 3
// (data/shaft/practice-review/vision/frames, production's session path incl. E-2 crop).
// Only the transport is replaced: window.fetch hands the request to Node, which tags it with
// metadata.user_id "s48-test-…", logs it to data/vision-max-tokens/calls.jsonl BEFORE sending,
// and posts it to the Worker with the dev Origin. Refuses to send past BUDGET calls.
// Rules: the first nRules DTL library rules, as rules.ts builds them (stable ids).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BUDGET = 25; // approved by Erik for S-48
const ORIGIN = 'http://localhost:5173';
const FRAMES = 'data/shaft/practice-review/vision/frames';
const OUT = 'data/vision-max-tokens';

(async () => {
  const [phase, mode, nRules, ids, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  if (!['quick', 'detailed'].includes(mode)) throw new Error('mode must be quick or detailed');
  fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
  const callsFile = path.join(OUT, 'calls.jsonl');
  const sent = () => (fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).length : 0);

  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1800000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1800000);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });

  let current = null;
  await page.exposeFunction('__s48post', async (url, bodyText) => {
    if (sent() >= BUDGET) throw new Error(`budget: ${BUDGET} calls already sent — stopping`);
    const body = JSON.parse(bodyText);
    body.metadata = { user_id: `s48-test-${phase}-${mode}-r${nRules}-${current}` };
    const sentAt = new Date().toISOString();
    fs.appendFileSync(callsFile, JSON.stringify({ sentAt, phase, mode, nRules: Number(nRules), id: current, maxTokens: body.max_tokens }) + '\n');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
    const text = await res.text();
    fs.writeFileSync(path.join(OUT, 'raw', `${phase}-${mode}-r${nRules}-${current}.json`), JSON.stringify({ sentAt, status: res.status, maxTokens: body.max_tokens, prompt: body.messages[0].content[0].text, response: text }));
    return { status: res.status, text };
  });
  await page.evaluate(() => {
    const orig = window.fetch;
    window.fetch = async (url, init) => {
      if (init?.method !== 'POST' || /\/log$/.test(String(url)) || !String(init.body).includes('"messages"')) return orig(url, init);
      const { status, text } = await window.__s48post(String(url), init.body);
      return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
    };
  });

  for (const id of ids.split(',')) {
    if (sent() >= BUDGET) { console.log(`budget reached (${BUDGET}) — stopping before ${id}`); break; }
    current = id;
    const f = JSON.parse(fs.readFileSync(path.join(FRAMES, `${id}.json`), 'utf8'));
    const r = await page.evaluate(async (frames, n, quick) => {
      const { analyzeSwing } = await import('/src/lib/api.ts');
      const { RULE_LIBRARY } = await import('/src/data/ruleLibrary.ts');
      const { ruleMatchesAngle, ANGLE_TO_PROMPT } = await import('/src/lib/cameraAngle.ts');
      const rules = RULE_LIBRARY.filter((r) => ruleMatchesAngle(r, 'dtl')).slice(0, n).map((l) => ({
        id: `r-${l.id}`, title: l.title, description: l.description, phase: l.phase, weight: l.weight,
        active: true, angles: l.angles, libraryId: l.id, drills: l.drills,
      }));
      let usage = null;
      try {
        const analysis = await analyzeSwing(frames, rules, { cameraAngle: ANGLE_TO_PROMPT.dtl, quickMode: quick, onUsage: (u) => { usage = u; } });
        return { analysis, usage };
      } catch (e) {
        return { error: String(e?.message ?? e), errorName: e?.name, usage };
      }
    }, f.frames, Number(nRules), mode === 'quick');
    const raw = JSON.parse(fs.readFileSync(path.join(OUT, 'raw', `${phase}-${mode}-r${nRules}-${id}.json`), 'utf8'));
    const stop = (() => { try { return JSON.parse(raw.response).stop_reason; } catch { return null; } })();
    fs.appendFileSync(path.join(OUT, 'results.jsonl'), JSON.stringify({ phase, mode, nRules: Number(nRules), id, stop, ...r }) + '\n');
    const u = r.usage ?? {};
    console.log(`${phase} ${mode} r${nRules} ${id}: stop ${stop} | max ${u.maxTokens} out ${u.outputTokens} in ${u.inputTokens} cr ${u.cacheReadTokens} cw ${u.cacheCreationTokens} | sent ${sent()}/${BUDGET}${r.error ? ' | ' + r.error.slice(0, 100) : ''}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
