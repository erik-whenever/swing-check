// STAGE 2 — send each frame set to Vision, three times per (swing, resolution).
//
// The request is assembled to be BYTE-IDENTICAL in shape to what src/lib/api.ts sends:
// same system block, same cache breakpoints, same frame-count note, same image encoding,
// and the prompt itself comes from the production `buildSwingPrompt`. Only the rules
// differ, and rules are user data — production reads them from the rules store, we pass
// our eight. Nothing about the production prompt is edited.
//
// Traffic goes through the Worker, never straight to Anthropic: the API key is a Worker
// secret and must stay one. The Worker's origin allowlist is satisfied with a localhost
// Origin header (see worker/wrangler.toml → ALLOWED_ORIGINS).
//
// THREE RUNS, TEMPERATURE UNCHANGED. Neither the app nor the Worker sets `temperature`,
// so all three runs sample at the API default. Repeat-run disagreement is therefore the
// model's own answer-to-answer spread on identical input — which is the proxy for
// reliability this evaluation is built around. Prompt caching makes runs 2 and 3 cheap
// and does not affect sampling.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadProductionModules, writeJson, REPO_ROOT } from './production-modules.mjs';
import { promptRules } from './rules.mjs';

const FRAMES_DIR = join(REPO_ROOT, 'experiments', 'frames');
const RUNS_DIR = join(REPO_ROOT, 'experiments', 'runs');
const WORK_DIR = join(REPO_ROOT, 'experiments', '.work');

export const RUNS_PER_CELL = 3;
export const PROFILES = ['current', 'full'];

/** Keep in sync with CLAUDE_SONNET_4_5_PRICING in src/lib/api.ts. */
const PRICING = {
  inputPerMillionTokens: 3.0,
  outputPerMillionTokens: 15.0,
  cacheWritePerMillionTokens: 3.75,
  cacheReadPerMillionTokens: 0.3,
};

/** Matches MAX_TOKENS_DETAILED in src/lib/api.ts. Detailed mode, not quick: the whole
 *  point is to read the model's own evidence for each verdict. */
const MAX_TOKENS = 2000;

const ANGLE_TO_PROMPT = { 'down-the-line': 'down-the-line', 'face-on': 'face-on' };

function readEnv() {
  return readFile(join(REPO_ROOT, '.env'), 'utf8')
    .then((text) =>
      Object.fromEntries(
        text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => {
            const i = line.indexOf('=');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
          }),
      ),
    )
    .catch(() => ({}));
}

async function loadFrameSet(swingId, profile) {
  const dir = join(FRAMES_DIR, swingId, profile);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
  return Promise.all(files.map((f) => readFile(join(dir, f)).then((b) => b.toString('base64'))));
}

/** Build the request body exactly as src/lib/api.ts does. */
function buildBody(prod, frames, rules, cameraAngle) {
  const prompt = prod.buildSwingPrompt({
    rules,
    focusRuleId: null,
    frameCount: frames.length,
    cameraAngle,
    quickMode: false,
  });

  const imageContent = frames
    .map((b64, i) => [
      { type: 'text', text: `Frame ${i + 1}/${frames.length}:` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
    ])
    .flat();

  return {
    model: 'claude-sonnet-4-5',
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: prod.SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: prod.buildFrameCountNote(frames.length) },
          ...imageContent,
        ],
      },
    ],
  };
}

function costOf(usage) {
  return (
    ((usage.input_tokens ?? 0) * PRICING.inputPerMillionTokens +
      (usage.output_tokens ?? 0) * PRICING.outputPerMillionTokens +
      (usage.cache_creation_input_tokens ?? 0) * PRICING.cacheWritePerMillionTokens +
      (usage.cache_read_input_tokens ?? 0) * PRICING.cacheReadPerMillionTokens) /
    1_000_000
  );
}

/** Parse the model's JSON the way src/lib/api.ts does — fenced code blocks stripped. */
function parseAnalysis(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

async function callVision(apiUrl, origin, body, attempt = 1) {
  const startedAt = Date.now();
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
  const visionMs = Date.now() - startedAt;

  if (!response.ok) {
    const text = await response.text();
    // 429 is the Worker's daily cap or Anthropic's rate limit; 5xx is transient. Both
    // are worth one patient retry — a failed cell costs a whole (swing, profile) column.
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const waitMs = 5000 * attempt;
      console.log(`      ${response.status} — retrying in ${waitMs / 1000}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      return callVision(apiUrl, origin, body, attempt + 1);
    }
    throw new Error(`API ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return { data, visionMs };
}

export async function runEval({ swingIds = null, verbose = true } = {}) {
  const prod = await loadProductionModules(WORK_DIR);
  const env = await readEnv();
  // Process env wins so the endpoint can be pointed at a local Worker (`wrangler dev`)
  // without editing .env.
  const apiUrl = process.env.VITE_API_URL ?? env.VITE_API_URL;
  if (!apiUrl) throw new Error('VITE_API_URL is not set in .env — the harness proxies through the Worker.');
  // Must be on the Worker's ALLOWED_ORIGINS list, or every call 403s.
  const origin = process.env.EVAL_ORIGIN ?? 'http://localhost:5173';

  const index = JSON.parse(await readFile(join(FRAMES_DIR, 'index.json'), 'utf8'));
  const ids = swingIds ?? index.swings;
  const rules = promptRules();

  const results = [];
  const skipped = [];
  let totalCost = 0;

  for (const swingId of ids) {
    const meta = JSON.parse(await readFile(join(FRAMES_DIR, swingId, 'meta.json'), 'utf8'));
    const cameraAngle = ANGLE_TO_PROMPT[meta.angle] ?? 'unknown';

    for (const profile of PROFILES) {
      // A `full` set that came out identical to `current` is the same request. Sending it
      // three more times would buy nothing but a bill; the report says so explicitly.
      if (profile === 'full' && meta.profiles.full.identicalToCurrent) {
        skipped.push(swingId);
        if (verbose) console.log(`    ${swingId}/full`.padEnd(34) + 'skipped — identical to current');
        continue;
      }
      const frames = await loadFrameSet(swingId, profile);
      const body = buildBody(prod, frames, rules, cameraAngle);

      for (let run = 1; run <= RUNS_PER_CELL; run++) {
        const label = `${swingId}/${profile}/run-${run}`;
        let record;
        try {
          const { data, visionMs } = await callVision(apiUrl, origin, body);
          const rawText = data.content?.[0]?.text ?? '';
          const truncated = data.stop_reason === 'max_tokens';
          let analysis = null;
          let parseError = null;
          try {
            analysis = parseAnalysis(rawText);
          } catch (err) {
            parseError = err.message;
          }
          const cost = costOf(data.usage ?? {});
          totalCost += cost;

          record = {
            swingId,
            profile,
            run,
            ok: !!analysis,
            truncated,
            parseError,
            stopReason: data.stop_reason,
            visionMs,
            usage: data.usage ?? {},
            costUsd: Number(cost.toFixed(5)),
            frameCount: frames.length,
            cameraAngle,
            rawText,
            analysis,
          };
          if (verbose) {
            const verdicts = analysis
              ? [...(analysis.rules ?? [])].map((r) => r.verdict[0]).join('')
              : parseError
                ? 'PARSE-FAIL'
                : '—';
            console.log(
              `    ${label.padEnd(30)} ${String(visionMs).padStart(6)} ms · ` +
                `$${cost.toFixed(4)} · ${verdicts}${truncated ? ' · TRUNCATED' : ''}`,
            );
          }
        } catch (err) {
          record = { swingId, profile, run, ok: false, error: err.message, frameCount: frames.length, cameraAngle };
          if (verbose) console.log(`    ${label.padEnd(30)} FAILED — ${err.message}`);
        }

        await writeJson(join(RUNS_DIR, swingId, profile, `run-${run}.json`), record);
        results.push(record);
      }
    }
  }

  await writeJson(join(RUNS_DIR, 'index.json'), {
    ranAt: new Date().toISOString(),
    runsPerCell: RUNS_PER_CELL,
    profiles: PROFILES,
    swings: ids,
    /** Swings whose `full` set was byte-identical to `current` and therefore not re-sent. */
    identicalFullSkipped: skipped,
    maxTokens: MAX_TOKENS,
    quickMode: false,
    totalCostUsd: Number(totalCost.toFixed(4)),
    callCount: results.length,
    failedCalls: results.filter((r) => !r.ok).length,
  });

  return { results, totalCost };
}
