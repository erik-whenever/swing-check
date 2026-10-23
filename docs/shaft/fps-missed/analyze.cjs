// ONE-OFF (S-49): feed every sample file from extract_browser.cjs / extract_python.py to
// the app's OWN segmenter (`detectSessionSwings`, imported from Vite, unchanged) and log,
// per candidate, which gate decides it and with which value.
//
//   npm run dev -- --port 5199 --strictPort      (in another terminal)
//   node docs/shaft/fps-missed/analyze.cjs <samplesDir> <out.json> [baseUrl]
//
// Nothing is re-implemented on the decision path. The extra numbers for the clipped-tail
// gate (is there a downswing pass, how long the longest settle run after it is) are READ
// from the envelope's own `debug` trace, with poseEnvelope.ts's constants copied below
// for the read-out only. They explain a decision the production code already made.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// poseEnvelope.ts, read-out only (OSÄKER if that file changes: re-copy).
const IMPACT_HEIGHT_TOL = 0.12;
const SETTLE_SPEED_FRAC = 0.2;
const FINISH_MIN_HOLD_FRAMES = 3;

(async () => {
  const [dir, outFile, baseUrl = 'http://localhost:5199/'] = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  const out = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = await page.evaluate(async (samples) => {
      const { detectSessionSwings } = await import('/src/lib/poseSegments.ts');
      const s = detectSessionSwings(samples, {});
      const pick = (cand, envelope, accepted, reason) => ({
        accepted,
        reason,
        candStartSec: cand.startSec,
        candEndSec: cand.endSec,
        burstStartSec: cand.burstStartSec,
        burstEndSec: cand.burstEndSec,
        envelope: envelope && {
          valid: envelope.valid,
          reason: envelope.reason ?? null,
          startSec: envelope.startSec,
          finishSec: envelope.finishSec,
          clippedTail: envelope.clippedTail,
          impact: envelope.impact,
          impactReason: envelope.impactReason,
          addressY: envelope.addressY,
          apexY: envelope.apexY,
          peakSpeed: envelope.peakSpeed,
          visibleFrac: envelope.visibleFrac,
          debug: envelope.debug ?? null,
        },
      });
      return {
        refSpeed: s.refSpeed,
        sampleDt: s.segmentation.sampleDt,
        segReason: s.segmentation.reason ?? null,
        bursts: s.segmentation.diagnostics.bursts,
        candidates: [
          ...s.swings.map((w) => pick(w.candidate, w.envelope, true, 'accepted')),
          ...s.rejected.map((x) => pick(x.candidate, x.envelope, false, x.reason)),
        ].sort((a, b) => a.candStartSec - b.candStartSec),
      };
    }, data.samples);

    const lastT = data.samples[data.samples.length - 1].t;
    for (const c of r.candidates) {
      const e = c.envelope;
      if (!e || !e.valid || !e.debug) continue;
      const fr = e.debug.frames;
      // downswing pass, exactly as poseEnvelope.ts picks it
      let passIdx = -1;
      let best = -1;
      let nearest = Infinity;
      for (let i = e.debug.startIdx + 1; i < fr.length; i++) {
        if (fr[i].vy <= 0) continue;
        const d = Math.abs(fr[i].y - e.addressY);
        nearest = Math.min(nearest, d);
        if (d > IMPACT_HEIGHT_TOL) continue;
        if (fr[i].speed > best) { best = fr[i].speed; passIdx = i; }
      }
      // longest run below the settle threshold after the pass
      const settle = e.peakSpeed * SETTLE_SPEED_FRAC;
      let run = 0;
      let longest = 0;
      let longestStart = null;
      let minRatio = Infinity;
      if (passIdx >= 0) {
        let start = 0;
        for (let i = passIdx + 1; i < fr.length; i++) {
          minRatio = Math.min(minRatio, fr[i].speed / e.peakSpeed);
          if (fr[i].speed < settle) {
            if (run === 0) start = i;
            run++;
            if (run > longest) { longest = run; longestStart = fr[start].t; }
          } else run = 0;
        }
      }
      c.tail = {
        passSec: passIdx >= 0 ? fr[passIdx].t : null,
        nearestDescendingToAddress: Number.isFinite(nearest) ? nearest : null,
        settleThresh: settle,
        longestSettleRunFrames: longest,
        longestSettleRunSec: longest * r.sampleDt,
        longestSettleRunStartSec: longestStart,
        minSpeedOverPeakAfterPass: Number.isFinite(minRatio) ? minRatio : null,
        framesNeeded: FINISH_MIN_HOLD_FRAMES,
        secAfterPassToClipEnd: passIdx >= 0 ? lastT - fr[passIdx].t : null,
        candidateEndsAtClipEnd: Math.abs(c.candEndSec - lastT) < 1e-6,
      };
      delete e.debug;
    }
    for (const c of r.candidates) if (c.envelope) delete c.envelope.debug;
    out.push({ clip: data.clip, config: data.config, videoFps: data.videoFps, samples: data.samples.length, lastT, ...r });
    const acc = r.candidates.filter((c) => c.accepted).length;
    console.log(`${data.clip} ${data.config}: ${acc} accepted / ${r.candidates.length} candidates / ${r.bursts.length} bursts`);
    for (const c of r.candidates) {
      const t = c.tail;
      console.log(`   cand ${c.candStartSec.toFixed(2)}–${c.candEndSec.toFixed(2)} env ${c.envelope ? `${c.envelope.startSec.toFixed(2)}–${c.envelope.finishSec.toFixed(2)}` : '-'}  ${c.reason}` +
        (t ? `  | pass ${t.passSec?.toFixed(2) ?? '—'} settleRun ${t.longestSettleRunFrames}/${t.framesNeeded} (${t.longestSettleRunSec.toFixed(2)}s) minSpd/peak ${t.minSpeedOverPeakAfterPass?.toFixed(3) ?? '—'} afterPass→end ${t.secAfterPassToClipEnd?.toFixed(2) ?? '—'}s` : ''));
    }
    for (const b of r.bursts.filter((b) => !b.admitted)) {
      console.log(`   culled burst ${b.startSec.toFixed(2)}–${b.endSec.toFixed(2)}: ${b.culledBy}`);
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
