// ONE-OFF (S-45): run PRODUCTION's segmenter over Erik's own clips, in the dev app.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/practice-review/segment_clips.cjs <clipDir> <out.json> [baseUrl]
//
// Nothing here re-implements the chain. Each clip goes through exactly what the app
// runs, imported from Vite's dev server into a real browser page:
//   extractPoseTrajectory (WASM PoseLandmarker, VIDEO mode, reset once per clip and
//   then warm across it, SAMPLE_FPS 15)  →  readTimeStretch  →  detectSessionSwings
// The File reaching the page comes from a real <input type=file>, like an upload.
// Output: one entry per clip with every accepted envelope and every rejection reason.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const [clipDir, outFile, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  if (!clipDir || !outFile) throw new Error('usage: segment_clips.cjs <clipDir> <out.json> [baseUrl]');
  const clips = fs.readdirSync(clipDir).filter((f) => /\.(mp4|mov)$/i.test(f)).sort();
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1800000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1800000);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  // A Vite full reload (any edited .html under the root triggers one) destroys the page
  // mid-clip. The input is re-created per clip and a destroyed context is retried, and
  // finished clips are kept in <out.json> so a rerun resumes instead of starting over.
  const fileInput = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__s45')) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.id = '__s45';
      document.body.appendChild(input);
    });
    return page.$('#__s45');
  };

  const results = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')).results : [];
  const done = new Set(results.map((r) => r.clip));
  for (const [n, clip] of clips.entries()) {
    if (done.has(clip)) continue;
    let r;
    for (let attempt = 1; ; attempt++) {
      try {
        r = await segment(await fileInput(), clip);
        break;
      } catch (e) {
        if (attempt >= 3 || !/context was destroyed|detached/i.test(e.message)) throw e;
        console.log(`${clip}: page reloaded, retrying`);
        await page.waitForNetworkIdle().catch(() => {});
      }
    }
    results.push({ clip, ...r });
    console.log(`${n + 1}/${clips.length} ${clip}: ${r.swings.length} swing(s)${r.timeStretched ? ' [stretched]' : ''}`);
    fs.writeFileSync(outFile, JSON.stringify({ clipDir, results }, null, 1));
  }
  await browser.close();

  async function segment(input, clip) {
    await input.uploadFile(path.resolve(clipDir, clip));
    return page.evaluate(async () => {
      const file = document.getElementById('__s45').files[0];
      const { extractPoseTrajectory } = await import('/src/lib/poseTrajectory.ts');
      const { readTimeStretch } = await import('/src/lib/mp4Probe.ts');
      const { detectSessionSwings } = await import('/src/lib/poseSegments.ts');
      const samples = await extractPoseTrajectory(file);
      const stretch = await readTimeStretch(file);
      const session = detectSessionSwings(samples, { timeStretched: stretch.timeStretched });
      return {
        samples: samples.length,
        durationSec: samples.length ? samples[samples.length - 1].t : 0,
        timeStretched: stretch.timeStretched,
        videoFps: stretch.videoFps,
        swings: session.swings.map((s) => ({
          envStartSec: s.envelope.startSec,
          envFinishSec: s.envelope.finishSec,
          impactSec: s.impactSec,
          candStartSec: s.candidate.startSec,
          candEndSec: s.candidate.endSec,
        })),
        rejected: session.rejected.map((x) => ({
          reason: x.reason,
          startSec: x.candidate.startSec,
          endSec: x.candidate.endSec,
        })),
        segReason: session.segmentation.reason ?? null,
      };
    });
  }
})().catch((e) => { console.error(e); process.exit(1); });
