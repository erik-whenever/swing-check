// Offline evaluation harness: how reliably does Vision judge shaft-dependent rules on
// the frames we already send it?
//
// DEV-ONLY. Lives in scripts/, is never imported by src/, and therefore never enters the
// bundle. It changes nothing in the app: the production selection modules and the
// production prompt are imported and run unmodified, and nothing is written back to them.
//
//   node scripts/vision-eval.mjs frames     # stage 1: clips + fixtures → frame sets
//   node scripts/vision-eval.mjs run --yes  # stage 2: frame sets → Vision (COSTS MONEY)
//   node scripts/vision-eval.mjs report     # stage 3: runs → docs/experiments/…
//   node scripts/vision-eval.mjs all --yes  # all three
//
// `run` refuses to spend anything without --yes. It prints the call count and an estimate
// first; that guard is the reason this is three stages and not one.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { extractFrames } from './vision-eval/extract-frames.mjs';
import { runEval, RUNS_PER_CELL, PROFILES } from './vision-eval/run.mjs';
import { buildReport, REPORT_PATH } from './vision-eval/report.mjs';
import { EVAL_RULES } from './vision-eval/rules.mjs';

/** Rough per-call cost at the frame sizes this harness produces; for the confirmation
 *  prompt only — the report states what was actually spent. */
const ESTIMATED_USD_PER_CALL = 0.05;

const [, , command = 'all', ...flags] = process.argv;
const confirmed = flags.includes('--yes') || flags.includes('-y');

async function stageFrames() {
  console.log('\n── Stage 1: extracting frames ──────────────────────────────');
  const swings = await extractFrames();
  console.log(`\n  ${swings.length} swings ready in experiments/frames/`);
  return swings;
}

async function stageRun() {
  console.log('\n── Stage 2: running Vision ─────────────────────────────────');
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { REPO_ROOT } = await import('./vision-eval/production-modules.mjs');
  const index = await readFile(join(REPO_ROOT, 'experiments', 'frames', 'index.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => {
      throw new Error('No extracted frames yet. Run `npm run eval:vision frames` first.');
    });
  // `full` sets that came out identical to `current` are not re-sent — same bytes, same
  // request — so they must not be in the estimate either.
  const comparable = index.resolutionComparable ?? index.swings;
  const identical = index.swings.length - comparable.length;
  const calls = (index.swings.length + comparable.length) * RUNS_PER_CELL;

  console.log(
    `  ${index.swings.length} swings × ${RUNS_PER_CELL} runs at \`current\`` +
      `${comparable.length ? ` + ${comparable.length} at \`full\`` : ''} = ${calls} Vision calls\n` +
      (identical
        ? `  (${identical} swing(s) had a \`full\` set identical to \`current\` — not re-sent)\n`
        : '') +
      `  ${EVAL_RULES.length} rules per call (${EVAL_RULES.filter((r) => r.group === 'shaft').length} shaft, ` +
      `${EVAL_RULES.filter((r) => r.group === 'body').length} body)\n` +
      `  Rough estimate: $${(calls * ESTIMATED_USD_PER_CALL).toFixed(2)} (prompt caching makes runs 2–3 cheaper)`,
  );

  if (!confirmed) {
    console.log(
      '\n  Not run — this spends real money against the Anthropic account.\n' +
        '  Re-run with --yes to go ahead:  node scripts/vision-eval.mjs run --yes\n',
    );
    process.exit(1);
  }

  const { totalCost, results } = await runEval();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n  ${results.length} calls, $${totalCost.toFixed(4)} spent${failed ? `, ${failed} failed` : ''}`);
}

async function stageReport() {
  console.log('\n── Stage 3: building report ────────────────────────────────');
  const markdown = await buildReport();
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, markdown, 'utf8');
  console.log(`  → ${REPORT_PATH}`);
}

try {
  if (command === 'frames') await stageFrames();
  else if (command === 'run') await stageRun();
  else if (command === 'report') await stageReport();
  else if (command === 'all') {
    await stageFrames();
    await stageRun();
    await stageReport();
  } else {
    console.error(`Unknown command "${command}". Use: frames | run | report | all`);
    process.exit(1);
  }
  console.log();
} catch (err) {
  console.error(`\n${err.message}\n`);
  process.exit(1);
}
