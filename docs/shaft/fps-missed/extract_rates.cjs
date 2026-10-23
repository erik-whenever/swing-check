// ONE-OFF (S-49 fix): pose samples from the APP's chain in a real browser at 15 fps and at
// 30 fps, for whole clip folders. Same as extract_browser.cjs except the second rate is a
// fixed 30 fps (not the clip's native rate) and the clip list may be ALL.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/fps-missed/extract_rates.cjs <clipDir> <outDir> <ALL|clip,clip,...> <15|30|15,30> [baseUrl]
//
// 15 fps = `extractPoseTrajectory` itself (exactly segment_clips.cjs). 30 fps = a copy of
// its sampling loop with SAMPLE_FPS replaced by 30; SAMPLE_FPS itself is not edited.
// Only wrists 15/16 are kept (the only landmarks the segmenter and the envelope read).
// Existing outputs are skipped, so a rerun resumes.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const [clipDir, outDir, only, rates, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  if (!clipDir || !outDir || !only || !rates) throw new Error('usage: extract_rates.cjs <clipDir> <outDir> <ALL|clips> <rates> [baseUrl]');
  fs.mkdirSync(outDir, { recursive: true });
  const clips = only === 'ALL'
    ? fs.readdirSync(clipDir).filter((f) => /\.(mp4|mov)$/i.test(f)).sort()
    : only.split(',');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 3600000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(3600000);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  const fileInput = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__s49r')) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.id = '__s49r';
      document.body.appendChild(input);
    });
    return page.$('#__s49r');
  };

  for (const [n, clip] of clips.entries()) {
    for (const rate of rates.split(',').map(Number)) {
      const target = path.join(outDir, `${clip.replace('.', '_')}.r${rate}.json`);
      if (fs.existsSync(target)) continue;
      const input = await fileInput();
      await input.uploadFile(path.resolve(clipDir, clip));
      const r = await page.evaluate(async (rate) => {
        const file = document.getElementById('__s49r').files[0];
        const { extractPoseTrajectory } = await import('/src/lib/poseTrajectory.ts');
        const { readTimeStretch } = await import('/src/lib/mp4Probe.ts');
        const { getPoseLandmarker, resetPoseLandmarker } = await import('/src/lib/poseDetector.ts');
        const stretch = await readTimeStretch(file);

        // Copy of extractPoseTrajectory's loop at another rate (as extract_browser.cjs).
        async function extractAt(fps) {
          await resetPoseLandmarker();
          const landmarker = await getPoseLandmarker();
          const url = URL.createObjectURL(file);
          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.src = url;
          const seekTo = (time) => new Promise((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = time;
          });
          try {
            await new Promise((resolve, reject) => {
              video.onloadedmetadata = () => resolve();
              video.onerror = () => reject(new Error('Failed to load video'));
            });
            await new Promise((resolve) => {
              if (video.readyState >= 3) return resolve();
              video.oncanplaythrough = () => resolve();
              video.load();
            });
            const duration = video.duration;
            const analysisSec = Math.min(duration, 300);
            const count = Math.max(2, Math.round(analysisSec * fps));
            const interval = analysisSec / count;
            const samples = [];
            let lastTsMs = -1;
            for (let i = 0; i < count; i++) {
              const t = Math.min(duration - 0.001, i * interval);
              await seekTo(t);
              let tsMs = Math.round(t * 1000);
              if (tsMs <= lastTsMs) tsMs = lastTsMs + 1;
              lastTsMs = tsMs;
              const result = landmarker.detectForVideo(video, tsMs);
              samples.push({ t, landmarks: result.landmarks?.[0] ?? [] });
            }
            return samples;
          } finally {
            URL.revokeObjectURL(url);
          }
        }

        const samples = rate === 15 ? await extractPoseTrajectory(file) : await extractAt(rate);
        return {
          videoFps: stretch.videoFps,
          timeStretched: stretch.timeStretched,
          samples: samples.map((s) => {
            const lm = [];
            for (const i of [15, 16]) {
              const p = s.landmarks[i];
              if (p) lm[i] = { x: p.x, y: p.y, z: p.z, visibility: p.visibility };
            }
            return { t: s.t, landmarks: lm };
          }),
        };
      }, rate);
      fs.writeFileSync(target, JSON.stringify({ clip, rate, ...r }));
      console.log(`${n + 1}/${clips.length} ${clip} r${rate}: ${r.samples.length} samples @ video ${r.videoFps} fps${r.timeStretched ? ' [stretched]' : ''}`);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
