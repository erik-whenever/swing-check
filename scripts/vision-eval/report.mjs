// STAGE 3 — turn the raw runs into the markdown report in docs/experiments/.
//
// THE METRIC. Three runs of an identical request give three verdicts per rule. Two
// numbers summarise them, and they answer different questions:
//
//   Enighet (unanimous)  — did all three runs land on the same verdict? Binary per cell,
//                          averaged over swings. This is the number to read: a rule that
//                          is not unanimous on identical input cannot be trusted on a
//                          single production run, whatever its confidence field says.
//   Parvis (pairwise)    — of the three run pairs, how many agree? 1.00 / 0.33 / 0.00.
//                          It separates "two out of three" from "three different answers",
//                          which the binary number flattens together.
//
// Neither measures CORRECTNESS. Self-consistency is a ceiling on reliability, not a
// substitute for it: a rule that answers "pass" three times may be confidently wrong.
// That is exactly why every response is reproduced verbatim at the end — the consistency
// tables narrow down which rules are worth Erik's time to check against the real swing,
// and the transcripts are where he checks them.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EVAL_RULES } from './rules.mjs';
import { RUNS_PER_CELL, PROFILES } from './run.mjs';
import { REPO_ROOT } from './production-modules.mjs';

const FRAMES_DIR = join(REPO_ROOT, 'experiments', 'frames');
const RUNS_DIR = join(REPO_ROOT, 'experiments', 'runs');
export const REPORT_PATH = join(REPO_ROOT, 'docs', 'experiments', 'vision-shaft-reliability.md');

const VERDICT_SHORT = { pass: 'P', fail: 'F', cannot_determine: '?' };

/** Swedish decimal comma, to match every other doc in docs/. */
function sv(n, digits = 2) {
  return (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits).replace('.', ',');
}

function pct(n) {
  return `${sv(n * 100, 1)} %`;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Pull one rule's result out of an analysis, wherever the model put it. */
function resultFor(analysis, ruleId) {
  if (!analysis) return null;
  if (analysis.focus_rule?.id === ruleId) return analysis.focus_rule;
  return (analysis.rules ?? []).find((r) => r.id === ruleId) ?? null;
}

/** Agreeing pairs / total pairs among n verdicts. 1.00 = unanimous, 0 = all different. */
function pairwiseAgreement(verdicts) {
  if (verdicts.length < 2) return null;
  let agree = 0;
  let total = 0;
  for (let i = 0; i < verdicts.length; i++) {
    for (let j = i + 1; j < verdicts.length; j++) {
      total++;
      if (verdicts[i] === verdicts[j]) agree++;
    }
  }
  return agree / total;
}

/** One (rule, swing, profile) cell: the three runs' answers and what they add up to. */
function buildCell(runs, ruleId) {
  const results = runs.map((run) => (run.ok ? resultFor(run.analysis, ruleId) : null));
  const verdicts = results.filter(Boolean).map((r) => r.verdict);
  const confidences = results.filter(Boolean).map((r) => r.confidence ?? 0);
  return {
    verdicts,
    // Only a cell where every run answered can be called unanimous — a missing run is a
    // gap in the evidence, not agreement.
    unanimous: verdicts.length === RUNS_PER_CELL && new Set(verdicts).size === 1,
    complete: verdicts.length === RUNS_PER_CELL,
    pairwise: pairwiseAgreement(verdicts),
    meanConfidence: mean(confidences),
    confidenceSpread: confidences.length > 1 ? Math.max(...confidences) - Math.min(...confidences) : 0,
    cannotDetermine: verdicts.filter((v) => v === 'cannot_determine').length,
    results,
  };
}

async function loadRuns(swingId, profile) {
  const dir = join(RUNS_DIR, swingId, profile);
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith('run-')).sort();
  } catch {
    // No directory = the profile was never sent (identical to `current`), not a failure.
    return [];
  }
  return Promise.all(files.map((f) => readFile(join(dir, f), 'utf8').then(JSON.parse)));
}

/** Aggregate a list of cells into the numbers a table row shows. */
function summarise(cells) {
  const usable = cells.filter((c) => c.verdicts.length > 0);
  return {
    cells: cells.length,
    unanimousPct: cells.length ? cells.filter((c) => c.unanimous).length / cells.length : 0,
    pairwise: mean(usable.map((c) => c.pairwise).filter((p) => p !== null)),
    cannotDeterminePct:
      usable.length
        ? usable.reduce((sum, c) => sum + c.cannotDetermine, 0) /
          usable.reduce((sum, c) => sum + c.verdicts.length, 0)
        : 0,
    meanConfidence: mean(usable.map((c) => c.meanConfidence)),
    confidenceSpread: mean(usable.map((c) => c.confidenceSpread)),
  };
}

export async function buildReport() {
  const framesIndex = JSON.parse(await readFile(join(FRAMES_DIR, 'index.json'), 'utf8'));
  const runsIndex = JSON.parse(await readFile(join(RUNS_DIR, 'index.json'), 'utf8'));
  const swingIds = runsIndex.swings;
  // Swings whose `full` set actually differed from `current`. Everything the report says
  // about resolution is scoped to these — averaging in swings where the two inputs were
  // the same bytes would manufacture a "no difference" result out of an empty comparison.
  const identicalFull = new Set(runsIndex.identicalFullSkipped ?? []);
  const comparable = swingIds.filter((id) => !identicalFull.has(id));
  /** Swings a profile has real data for. */
  const swingsFor = (profile) => (profile === 'full' ? comparable : swingIds);

  const metas = {};
  const runsBy = {};
  for (const id of swingIds) {
    metas[id] = JSON.parse(await readFile(join(FRAMES_DIR, id, 'meta.json'), 'utf8'));
    runsBy[id] = {};
    for (const profile of PROFILES) runsBy[id][profile] = await loadRuns(id, profile);
  }

  // cells[ruleId][profile][swingId]
  const cells = {};
  for (const rule of EVAL_RULES) {
    cells[rule.id] = {};
    for (const profile of PROFILES) {
      cells[rule.id][profile] = {};
      for (const id of swingIds) {
        cells[rule.id][profile][id] = buildCell(runsBy[id][profile], rule.id);
      }
    }
  }

  const collect = (predicate, profile) =>
    EVAL_RULES.filter(predicate).flatMap((rule) => swingsFor(profile).map((id) => cells[rule.id][profile][id]));

  const out = [];
  const p = (line = '') => out.push(line);

  // ── Header ────────────────────────────────────────────────────────────────
  p('# Vision-tillförlitlighet på skaftberoende regler');
  p();
  p(`> Offline-utvärdering. Genererad ${new Date().toISOString().slice(0, 10)} av`);
  p('> `npm run eval:vision` (`scripts/vision-eval/`). **Ingen produktionskod är rörd** —');
  p('> harnessen importerar `poseEnvelope`, `poseEnvelopeSelection`, `poseSegments`,');
  p('> `poseCropBox` och `prompt` oförändrade och kör dem i Node.');
  p();

  // ── The question ──────────────────────────────────────────────────────────
  const shaftAll = PROFILES.flatMap((profile) => collect((r) => r.group === 'shaft', profile));
  const bodyAll = PROFILES.flatMap((profile) => collect((r) => r.group === 'body', profile));
  const shaftSummary = summarise(shaftAll);
  const bodySummary = summarise(bodyAll);
  const gap = bodySummary.unanimousPct - shaftSummary.unanimousPct;

  p('## Frågan');
  p();
  p('Behöver vi bygga egen skaftdetektering, eller räcker Vision? Måttet är **hur ofta');
  p('Vision svarar samma sak tre gånger på exakt samma bildrutor**. Ett svar som inte är');
  p('stabilt mot sig självt kan inte vara tillförlitligt mot verkligheten, oavsett vad');
  p('`confidence`-fältet påstår.');
  p();
  p('Fem skaftberoende regler mäts mot tre kroppsregler som **kontrollgrupp**. Kroppsreglerna');
  p('åker med i samma request, på samma bildrutor, i samma svar. Vore bara skaftreglerna');
  p('ostabila är skaftet variabeln. Vore båda grupperna lika ostabila ligger felet i');
  p('bildrutorna, och egen skaftdetektering hade inte hjälpt.');
  p();
  p('| Grupp | Enighet (3/3 lika) | Parvis | cannot_determine | Medelkonfidens |');
  p('| --- | --- | --- | --- | --- |');
  p(
    `| **Skaftberoende** (5 regler) | ${pct(shaftSummary.unanimousPct)} | ${sv(shaftSummary.pairwise)} | ` +
      `${pct(shaftSummary.cannotDeterminePct)} | ${sv(shaftSummary.meanConfidence)} |`,
  );
  p(
    `| **Kropp, kontrollgrupp** (3 regler) | ${pct(bodySummary.unanimousPct)} | ${sv(bodySummary.pairwise)} | ` +
      `${pct(bodySummary.cannotDeterminePct)} | ${sv(bodySummary.meanConfidence)} |`,
  );
  p(`| **Skillnad** | ${gap >= 0 ? '+' : ''}${pct(gap)} till kroppens fördel | | | |`);
  p();
  p('**Så läses skillnaden.** Är gapet litet (några enstaka procent) beter sig skaftet inte');
  p('annorlunda än kroppen, och den dyra vägen — egen skaftdetektering — löser inte ett');
  p('problem vi har. Är gapet stort är skaftet den svaga länken, och siffran i den vänstra');
  p('kolumnen är taket för hur bra en skaftregel kan bli utan egen detektering.');
  p();
  p('> Enighet mäter **inte korrekthet.** Tre identiska "pass" kan vara tre gånger fel.');
  p('> Tabellerna säger vilka regler som är värda att granska; *[Modellsvar, ordagrant]');
  p('> (#modellsvar-ordagrant)* längst ned är där de granskas mot verkligheten.');
  p();

  // ── Method ────────────────────────────────────────────────────────────────
  p('## Metod');
  p();
  p(`- **Svingar:** ${swingIds.length} (${swingIds.join(', ')}), ur de frysta landmark-fixturerna i`);
  p('  `src/lib/__fixtures__/` plus Eriks matchande klipp. `session-multi` bidrar med tre');
  p('  svingar via `detectSessionSwings`; `dtl-clipped` är utesluten (ingen bekräftad impact →');
  p('  produktionens sessionsläge skippar den ändå).');
  p(`- **Bildruteval:** produktionens kedja, oförändrad — \`detectSwingEnvelope\` →`);
  p(`  \`selectEnvelopeFrames\` med budget ${framesIndex.frameBudget} och \`clusterPhases\` från de åtta reglernas faser,`);
  p('  precis som `useSessionCapture` gör.');
  p('- **Upplösningar:** samma beskärningslåda och samma JPEG-kvalitet i båda, bara');
  p(`  pixelantalet skiljer. \`current\` = långsida ≤ ${framesIndex.maxOutputSide} px (vad sessionsvägen skickar i dag),`);
  p('  `full` = beskärningslådan i källans egen upplösning. Beskärningen hålls konstant med');
  p('  flit: beskärning och skalning ändrar båda hur många pixlar som hamnar på skaftet, och');
  p('  varieras båda blir rapporten oförmögen att säga vilken som spelade roll.');
  p(`- **Körningar:** ${runsIndex.runsPerCell} per (sving × upplösning), identisk request. Varken appen eller Workern`);
  p('  sätter `temperature`, så alla körningar samplar på API-default — spridningen är');
  p('  modellens egen.');
  p(`- **Prompt:** produktionens \`SYSTEM_PROMPT\` + \`buildSwingPrompt\`, detaljerat läge`);
  p(`  (\`max_tokens\` ${runsIndex.maxTokens}), via Workern. Bara regeluppsättningen är evalens egen — regler är`);
  p('  användardata, och produktionen läser dem ur regel-storen.');
  p(`- **Kostnad:** ${runsIndex.callCount} anrop, $${runsIndex.totalCostUsd.toFixed(2)} totalt.`);
  if (runsIndex.failedCalls > 0) {
    p(`- **⚠ Misslyckade anrop:** ${runsIndex.failedCalls} av ${runsIndex.callCount}. Deras celler räknas som ofullständiga`);
    p('  (aldrig som enighet) och är utmärkta i tabellerna nedan.');
  }
  p();

  // ── Per rule × resolution ─────────────────────────────────────────────────
  p('## Samstämmighet per regel och upplösning');
  p();
  p(`Enighet = andelen svingar där alla ${RUNS_PER_CELL} körningar gav samma verdict. Parvis = andelen`);
  p('överensstämmande körningspar (1.00 = alla lika, 0.33 = två av tre, 0.00 = tre olika).');
  p();
  p('| Regel | Grupp | Upplösning | Svingar | Enighet | Parvis | cannot_determine | Konfidens | Konf.spridning |');
  p('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const rule of EVAL_RULES) {
    for (const profile of PROFILES) {
      const ids = swingsFor(profile);
      if (ids.length === 0) {
        p(`| ${profile === PROFILES[0] ? rule.title : ' '} | | \`${profile}\` | 0 | — | — | — | — | — |`);
        continue;
      }
      const s = summarise(ids.map((id) => cells[rule.id][profile][id]));
      p(
        `| ${profile === PROFILES[0] ? rule.title : ' '} | ${profile === PROFILES[0] ? (rule.group === 'shaft' ? 'skaft' : 'kropp') : ' '} | \`${profile}\` | ${ids.length} | ` +
          `${pct(s.unanimousPct)} | ${sv(s.pairwise)} | ${pct(s.cannotDeterminePct)} | ` +
          `${sv(s.meanConfidence)} | ${sv(s.confidenceSpread)} |`,
      );
    }
  }
  p();
  if (identicalFull.size > 0) {
    p(
      `> \`full\` täcker ${comparable.length} av ${swingIds.length} svingar. För ${[...identicalFull].map((id) => `\`${id}\``).join(', ')} ` +
        'blev den beskurna lådan kortare än ' + framesIndex.maxOutputSide + ' px redan i källan, så `full` och `current` blev',
    );
    p('> **samma bildrutor byte för byte**. De svingarna skickades inte en andra gång.');
    p();
  }

  // ── Resolution effect ─────────────────────────────────────────────────────
  p('## Effekt av upplösning');
  p();
  p('Först: hur mycket upplösning det ens fanns att vinna. `full` är beskärningslådan i');
  p('källans egen upplösning — det är taket. Går inte pixelfaktorn över 1,0 finns ingen');
  p('nedskalning att ta bort, och raden är inte en mätning.');
  p();
  p('| Sving | Vinkel | Bildrutor | Beskärning | `current` | `full` | Pixelfaktor |');
  p('| --- | --- | --- | --- | --- | --- | --- |');
  for (const id of swingIds) {
    const m = metas[id];
    const c = m.profiles.current;
    const f = m.profiles.full;
    const factor = f.pixelFactor ?? 1;
    p(
      `| \`${id}\` | ${m.angle} | ${m.selection.picked} | ${c.crop.reason} (${c.crop.areaPct} %) | ` +
        `${c.crop.output.width}×${c.crop.output.height}, ${c.avgKb} kB | ` +
        `${f.crop.output.width}×${f.crop.output.height}, ${f.avgKb} kB | ` +
        `${identicalFull.has(id) ? '1,0× (identisk)' : `${sv(factor, 2)}×`} |`,
    );
  }
  p();

  if (comparable.length === 0) {
    p('**Ingen sving hade något att hämta i upplösning.** På samtliga svingar var den');
    p(`beskurna lådan redan kortare än ${framesIndex.maxOutputSide} px i källan, så bildrutorna vi skickar i dag`);
    p('*är* full upplösning. Det är i sig ett svar på frågan: skulle skaftreglerna visa sig');
    p('opålitliga går det inte att laga med fler pixlar från de här inspelningarna — det');
    p('taket sitter i kameran, inte i nedskalningen.');
    p();
  } else {
    p(`Skillnaden \`full\` − \`current\` i enighet, över de ${comparable.length} svingar där de två faktiskt`);
    p('skilde sig åt. Positiv siffra = full upplösning gav stabilare svar, alltså att');
    p(`nedskalningen till ${framesIndex.maxOutputSide} px kostar något. Nära noll = nedskalningen är gratis för den`);
    p('regeln, och en dyrare bildruta köper ingenting.');
    p();
    p('| Regel | Grupp | `current` | `full` | Skillnad |');
    p('| --- | --- | --- | --- | --- |');
    for (const rule of EVAL_RULES) {
      // Both columns restricted to the same swings — otherwise the difference would
      // partly be a difference in which swings each side averaged over.
      const cur = summarise(comparable.map((id) => cells[rule.id].current[id]));
      const full = summarise(comparable.map((id) => cells[rule.id].full[id]));
      const delta = full.unanimousPct - cur.unanimousPct;
      p(
        `| ${rule.title} | ${rule.group === 'shaft' ? 'skaft' : 'kropp'} | ${pct(cur.unanimousPct)} | ${pct(full.unanimousPct)} | ` +
          `${delta > 0 ? '+' : ''}${pct(delta)} |`,
      );
    }
    const curAll = summarise(EVAL_RULES.flatMap((r) => comparable.map((id) => cells[r.id].current[id])));
    const fullAll = summarise(EVAL_RULES.flatMap((r) => comparable.map((id) => cells[r.id].full[id])));
    const deltaAll = fullAll.unanimousPct - curAll.unanimousPct;
    p(
      `| **Alla regler** | | **${pct(curAll.unanimousPct)}** | **${pct(fullAll.unanimousPct)}** | ` +
        `**${deltaAll > 0 ? '+' : ''}${pct(deltaAll)}** |`,
    );
    p();
  }

  // ── Per swing ─────────────────────────────────────────────────────────────
  p('## Samstämmighet per sving');
  p();
  p('Vilka svingar som är svåra, och för vilken grupp. En sving som drar ned skaftgruppen');
  p('men inte kroppsgruppen är en sving där skaftet är svårt att se — inte en dålig');
  p('inspelning.');
  p();
  p('| Sving | Envelope | Impact | Upplösning | Enighet skaft | Enighet kropp |');
  p('| --- | --- | --- | --- | --- | --- |');
  for (const id of swingIds) {
    const m = metas[id];
    for (const profile of PROFILES) {
      const first = profile === PROFILES[0];
      const head =
        `| ${first ? `\`${id}\`` : ' '} | ` +
        `${first ? `${sv(m.envelope.startSec)}–${sv(m.envelope.finishSec)} s` : ' '} | ` +
        `${first ? (m.envelope.impactSec !== null ? `${sv(m.envelope.impactSec)} s` : '—') : ' '} | \`${profile}\``;
      if (profile === 'full' && identicalFull.has(id)) {
        p(`${head} | *samma bildrutor som \`current\`* | |`);
        continue;
      }
      const shaft = summarise(EVAL_RULES.filter((r) => r.group === 'shaft').map((r) => cells[r.id][profile][id]));
      const body = summarise(EVAL_RULES.filter((r) => r.group === 'body').map((r) => cells[r.id][profile][id]));
      p(`${head} | ${pct(shaft.unanimousPct)} | ${pct(body.unanimousPct)} |`);
    }
  }
  p();

  // ── Verdict matrix ────────────────────────────────────────────────────────
  p('## Verdictmatris');
  p();
  p('Varje cell är de tre körningarnas verdict i ordning. `P` = pass, `F` = fail, `?` =');
  p('cannot_determine, `·` = körningen gav inget svar. Det är här man ser *hur* en regel');
  p('vacklar — `PFP` och `P?P` är olika sorters problem.');
  p();
  for (const profile of PROFILES) {
    const ids = swingsFor(profile);
    if (ids.length === 0) continue;
    p(`**\`${profile}\`**`);
    p();
    p(`| Regel | ${ids.map((id) => `\`${id}\``).join(' | ')} |`);
    p(`| --- | ${ids.map(() => '---').join(' | ')} |`);
    for (const rule of EVAL_RULES) {
      const row = ids.map((id) => {
        const cell = cells[rule.id][profile][id];
        const chars = cell.results.map((r) => (r ? VERDICT_SHORT[r.verdict] ?? '?' : '·')).join('') || '···';
        return cell.unanimous ? `\`${chars}\`` : `**\`${chars}\`**`;
      });
      p(`| ${rule.title} (${rule.group === 'shaft' ? 'skaft' : 'kropp'}) | ${row.join(' | ')} |`);
    }
    p();
  }
  p('Fetstil = körningarna var oense.');
  p();

  // ── Verbatim ──────────────────────────────────────────────────────────────
  p('## Modellsvar, ordagrant');
  p();
  p('Varje svar precis som modellen gav det, ohämtat och oredigerat. Detta är materialet');
  p('för att bedöma svaren **mot verkligheten** — tabellerna ovan vet bara om modellen är');
  p('överens med sig själv, aldrig om den har rätt. Läs särskilt `visual_evidence` på de');
  p('skaftregler som var eniga: en stabil regel som beskriver ett skaft den omöjligt kan se');
  p('är värre än en som vacklar.');
  p();
  for (const id of swingIds) {
    const m = metas[id];
    p(`### \`${id}\` — ${m.angle}, ${m.selection.picked} bildrutor`);
    p();
    p(
      `Envelope ${sv(m.envelope.startSec)}–${sv(m.envelope.finishSec)} s · impact ` +
        `${m.envelope.impactSec !== null ? `${sv(m.envelope.impactSec)} s` : 'ingen'} · klipp \`${m.clip}\``,
    );
    p();
    for (const profile of PROFILES) {
      if (profile === 'full' && identicalFull.has(id)) {
        p('*`full` gav samma bildrutor som `current` för den här svingen och skickades inte.*');
        p();
        continue;
      }
      for (const run of runsBy[id][profile]) {
        const title = `\`${profile}\` körning ${run.run}`;
        if (!run.ok) {
          p(`<details><summary>${title} — <strong>misslyckades</strong></summary>`);
          p();
          p('```');
          p(run.error ?? run.parseError ?? 'okänt fel');
          if (run.rawText) {
            p('');
            p('--- rått svar ---');
            p(run.rawText);
          }
          p('```');
          p();
          p('</details>');
          p();
          continue;
        }
        const a = run.analysis;
        const summary =
          `${title} — ${run.visionMs} ms, $${run.costUsd.toFixed(4)}, ` +
          `vinkel enligt modellen: ${a.camera_angle_detected}, bildkvalitet: ${a.frame_quality}` +
          `${run.truncated ? ' — ⚠ AVKORTAT (max_tokens)' : ''}`;
        p(`<details><summary>${summary}</summary>`);
        p();
        p('```json');
        p(JSON.stringify(a, null, 2));
        p('```');
        p();
        p('</details>');
        p();
      }
    }
  }

  // ── How to act ────────────────────────────────────────────────────────────
  p('## Hur utfallet ska användas');
  p();
  p('1. **Läs gapet skaft − kropp först.** Det är den enda siffran som isolerar skaftet från');
  p('   allt annat som kan göra en bildruta svår.');
  p('2. **Läs sedan upplösningskolumnen.** Lyfter `full` skaftreglerna märkbart är den');
  p('   billiga åtgärden att skicka fler pixlar, inte att bygga skaftdetektering. Lyfter den');
  p('   ingenting är nedskalningen till ' + framesIndex.maxOutputSide + ' px inte problemet — skaftet är för tunt för att');
  p('   modellen ska hålla i det, och mer upplösning köper inget.');
  p('3. **Läs `cannot_determine`-andelen.** En hög andel är ett *ärligt* utfall: modellen');
  p('   säger själv att den inte ser skaftet. Det är ett mycket bättre läge än hög enighet');
  p('   på svar som transkripten visar är påhittade.');
  p('4. **Granska transkripten på de eniga skaftreglerna.** Stabil och fel är den farliga');
  p('   kombinationen, och den syns bara här.');
  p();
  p('Utfallet avgör inte frågan på egen hand — det säger vad taket ligger på. Ett beslut om');
  p('egen skaftdetektering behöver också en uppfattning om vad den skulle kosta att bygga,');
  p('och den kostnaden ligger utanför den här mätningen.');
  p();

  return out.join('\n');
}
