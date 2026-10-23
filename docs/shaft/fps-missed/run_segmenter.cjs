// ONE-OFF (S-49 fix): feed every sample file from extract_rates.cjs to the app's OWN
// segmenter in the dev app and record what it decides. Run once on the old
// poseEnvelope.ts and once on the new one; compare_fix.py diffs the two.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/fps-missed/run_segmenter.cjs <samplesDir> <out.json> <own|web> [baseUrl]
//
// own: production path, detectSessionSwings(samples, { timeStretched }) with the file's flag.
// web: also the dataset path that produced S-32's swings: collectDatasetSwings on top, and
//      every web clip is frozen (frozenClips.ts) → timeStretched false there.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const [dir, outFile, kind, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1800000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1800000);
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  const out = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = await page.evaluate(async (samples, timeStretched, kind) => {
      const { detectSessionSwings } = await import('/src/lib/poseSegments.ts');
      const { collectDatasetSwings } = await import('/src/lib/dataset/datasetGate.ts');
      const env = (e) => e && {
        startSec: e.startSec, finishSec: e.finishSec, clippedTail: e.clippedTail,
        impactSec: e.impact?.timeSec ?? null, peakSpeed: e.peakSpeed,
      };
      const prodOpts = { timeStretched };
      const s = detectSessionSwings(samples, prodOpts);
      const res = {
        prod: {
          swings: s.swings.map((w) => env(w.envelope)),
          rejected: s.rejected.map((x) => ({ reason: x.reason, candStartSec: x.candidate.startSec, candEndSec: x.candidate.endSec, envelope: env(x.envelope) })),
        },
      };
      if (kind === 'web') {
        const sd = detectSessionSwings(samples, { timeStretched: false });
        const d = collectDatasetSwings(sd, { timeStretched: false });
        res.dataset = {
          swings: d.swings.map((w) => ({ ...env(w.envelope), gate: w.gate })),
          rejected: d.rejected.map((x) => ({ reason: x.reason, candStartSec: x.candidate.startSec })),
        };
      }
      return res;
    }, data.samples, !!data.timeStretched, kind);
    out.push({ file: f, clip: data.clip, rate: data.rate, timeStretched: !!data.timeStretched, videoFps: data.videoFps, ...r });
    console.log(`${data.clip} r${data.rate}: prod ${r.prod.swings.length}${r.dataset ? ` dataset ${r.dataset.swings.length}` : ''}`);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
