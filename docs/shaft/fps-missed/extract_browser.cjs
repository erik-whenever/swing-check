// ONE-OFF (S-49): pose samples from the APP's chain in a real browser, at 15 fps and at
// the clip's native fps, so the segmenter can be fed both from the SAME tracker.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/fps-missed/extract_browser.cjs <clipDir> <outDir> <clip,clip,...> [baseUrl]
//
// 15 fps = `extractPoseTrajectory` itself, imported from Vite (exactly segment_clips.cjs).
// native = a copy of its sampling loop with SAMPLE_FPS replaced by the video's own fps
// (from `readTimeStretch`). Same landmarker (`resetPoseLandmarker` + `getPoseLandmarker`),
// same seek-and-grab, same timestamp rule. SAMPLE_FPS is a module constant and is NOT
// edited; the copy is the only way to change the rate without touching production code.
// Output per clip and config: { clip, config, videoFps, samples: [{ t, landmarks }] } with
// only wrists 15/16 kept (the only landmarks the segmenter and the envelope read).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const [clipDir, outDir, only, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  if (!clipDir || !outDir || !only) throw new Error('usage: extract_browser.cjs <clipDir> <outDir> <clips> [baseUrl]');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1800000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(1800000);
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = '__s49';
    document.body.appendChild(input);
  });
  const input = await page.$('#__s49');

  for (const clip of only.split(',')) {
    await input.uploadFile(path.resolve(clipDir, clip));
    for (const config of ['browser15', 'browserNative']) {
      const target = path.join(outDir, `${clip.replace('.', '_')}.${config}.json`);
      if (fs.existsSync(target)) continue;
      const r = await page.evaluate(async (config) => {
        const file = document.getElementById('__s49').files[0];
        const { extractPoseTrajectory } = await import('/src/lib/poseTrajectory.ts');
        const { readTimeStretch } = await import('/src/lib/mp4Probe.ts');
        const { getPoseLandmarker, resetPoseLandmarker } = await import('/src/lib/poseDetector.ts');
        const stretch = await readTimeStretch(file);

        // Copy of extractPoseTrajectory's loop, rate = native fps. Kept line-for-line.
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

        const samples = config === 'browser15'
          ? await extractPoseTrajectory(file)
          : await extractAt(stretch.videoFps);
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
      }, config);
      fs.writeFileSync(target, JSON.stringify({ clip, config, ...r }));
      console.log(`${clip} ${config}: ${r.samples.length} samples @ video ${r.videoFps} fps`);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
