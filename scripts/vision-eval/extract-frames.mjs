// STAGE 1 — turn clips + frozen landmark fixtures into two frame sets per swing.
//
// The selection (envelope, segmentation, frame allocation, crop box) is computed in Node
// by the PRODUCTION modules, imported unchanged. Headless Chrome is used for one thing
// only: decoding video and encoding JPEG, which Node cannot do here (no ffmpeg on this
// machine, and node-canvas does not decode H.264).
//
// TWO PROFILES, ONE VARIABLE. Both profiles use the SAME crop rectangle and the SAME JPEG
// quality; the only difference is how many pixels the rectangle is resampled to:
//
//   current — long side capped at MAX_OUTPUT_SIDE (900). Byte-for-byte what the session
//             path sends to Vision today.
//   full    — the crop rectangle at its native source resolution, no downscale.
//
// Cropping is held constant on purpose. Crop and scale both change how many pixels land
// on the shaft, and varying both at once would leave the report unable to say which one
// mattered.

import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { loadProductionModules, loadFixture, writeJson, REPO_ROOT } from './production-modules.mjs';
import { resolveSwings } from './swings.mjs';
import { promptRules } from './rules.mjs';

const CLIPS_DIR = join(REPO_ROOT, 'experiments', 'clips');
const FRAMES_DIR = join(REPO_ROOT, 'experiments', 'frames');
const WORK_DIR = join(REPO_ROOT, 'experiments', '.work');

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v'];
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };

/** Production JPEG quality for analysis frames (useSessionCapture FRAME_QUALITY). */
const FRAME_QUALITY = 0.8;
/** Seeks that never settle must not hang the run. */
const SEEK_TIMEOUT_MS = 5000;

const round1 = (n) => Math.round(n * 10) / 10;

/** Rule phases → the SwingPhase vocabulary selectEnvelopeFrames speaks. */
function rulePhasesToSwingPhases(rules) {
  return rules.map((r) => (r.phase === 'follow' ? 'follow-through' : r.phase));
}

async function findClip(name) {
  let entries;
  try {
    entries = await readdir(CLIPS_DIR);
  } catch {
    throw new Error(
      `No clips directory at ${CLIPS_DIR}. Create it and drop the source clips in — ` +
        `see docs/experiments/README-vision-eval.md.`,
    );
  }
  const match = entries.find(
    (f) => VIDEO_EXTENSIONS.includes(extname(f).toLowerCase()) && f.slice(0, -extname(f).length) === name,
  );
  if (!match) {
    throw new Error(
      `No clip named "${name}" in experiments/clips/ (looked for ${VIDEO_EXTENSIONS.join('/')}). ` +
        `Found: ${entries.join(', ') || '(empty)'}`,
    );
  }
  return match;
}

/**
 * Serve both the clips and the host page from ONE origin. The page must come from the
 * same origin as the video: a canvas that has drawn a cross-origin video frame is
 * tainted, and `toDataURL` on a tainted canvas throws — which is exactly what the frame
 * grab does.
 */
function serveClips() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/') {
        const clip = url.searchParams.get('clip') ?? '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><body style="margin:0">
           <video muted playsinline preload="auto" src="/clip/${encodeURIComponent(clip)}"></video>`,
        );
        return;
      }
      if (!url.pathname.startsWith('/clip/')) {
        // Chrome asks for /favicon.ico unprompted; anything else here is a bug, and
        // either way an unhandled ReadStream error would take the whole run down.
        res.writeHead(404).end();
        return;
      }
      const name = decodeURIComponent(url.pathname.slice('/clip/'.length));
      const path = join(CLIPS_DIR, name);
      if (!path.startsWith(CLIPS_DIR)) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream' });
      createReadStream(path)
        .on('error', () => res.destroy())
        .pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Compute, for one spec, the list of swings it contains and each swing's frame times +
 * crop bounds. Pure Node — the production modules, unmodified.
 */
async function planSwing(spec, prod) {
  const samples = await loadFixture(spec.fixture);
  const spanStart = samples[0].t;
  const spanEnd = samples[samples.length - 1].t;
  const clusterPhases = rulePhasesToSwingPhases(promptRules());

  /** @type {{envelope: any, index: number}[]} */
  let envelopes;
  if (spec.mode === 'session') {
    const detected = prod.detectSessionSwings(samples);
    if (detected.swings.length === 0) {
      throw new Error(`Fixture ${spec.fixture} yielded no swings — nothing to evaluate.`);
    }
    envelopes = detected.swings.map((s, i) => ({ envelope: s.envelope, index: i + 1 }));
  } else {
    const envelope = prod.detectSwingEnvelope(samples);
    if (!envelope.valid) {
      throw new Error(`Fixture ${spec.fixture} has no valid envelope: ${envelope.reason}`);
    }
    envelopes = [{ envelope, index: 1 }];
  }

  return envelopes.map(({ envelope, index }) => {
    const selection = prod.selectEnvelopeFrames(
      envelope,
      prod.ANALYSIS_FRAME_COUNT,
      envelope.startSec,
      envelope.finishSec,
      { clusterPhases },
    );
    const bounds = prod.computeLandmarkBounds(samples, envelope.startSec, envelope.finishSec);
    return {
      // One id per swing, so session-multi becomes three rows in the report.
      id: envelopes.length > 1 ? `${spec.id}-${index}` : spec.id,
      spec,
      picks: selection.picks,
      selection: {
        requested: selection.requested,
        picked: selection.picks.length,
        allocation: selection.allocation,
        clusterPhases: selection.clusterPhases,
        usedEnvelope: selection.usedEnvelope,
        impactClusterApplied: selection.impactClusterApplied,
      },
      envelope: {
        startSec: envelope.startSec,
        finishSec: envelope.finishSec,
        impactSec: envelope.impact?.timeSec ?? null,
        clippedTail: envelope.clippedTail,
      },
      bounds,
      spanStart,
      spanEnd,
    };
  });
}

/** Grab one swing's frames at both profiles, inside the already-open page. */
async function grabProfiles(page, plan, prod, sourceSize) {
  const times = plan.picks.map((p) => p.t);
  const out = {};

  for (const profile of ['current', 'full']) {
    // Same box both times; only the output pixel count differs.
    const maxSide = profile === 'current' ? prod.MAX_OUTPUT_SIDE : Number.MAX_SAFE_INTEGER;
    const crop = prod.planCrop(plan.bounds, sourceSize.width, sourceSize.height, maxSide);

    const frames = await page.evaluate(
      async (times, rect, output, quality, seekTimeoutMs) => {
        const video = document.querySelector('video');
        const canvas = document.createElement('canvas');
        canvas.width = output.width;
        canvas.height = output.height;
        const ctx = canvas.getContext('2d');
        const src = rect ?? { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };

        const seekTo = (t) =>
          new Promise((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              video.onseeked = null;
              resolve();
            };
            const timer = setTimeout(done, seekTimeoutMs);
            video.onseeked = done;
            video.currentTime = t;
          });

        const out = [];
        for (const time of times) {
          // Same clamp frameExtractor/poseFrameGrab apply — a request at the very last
          // frame otherwise lands past the end and returns the previous frame twice.
          const t = Math.min(video.duration - 0.05, Math.max(0, time));
          await seekTo(t);
          ctx.drawImage(video, src.x, src.y, src.width, src.height, 0, 0, canvas.width, canvas.height);
          out.push(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        }
        return out;
      },
      times,
      crop.rect,
      crop.output,
      FRAME_QUALITY,
      SEEK_TIMEOUT_MS,
    );

    out[profile] = {
      frames,
      crop: {
        reason: crop.reason,
        rect: crop.rect,
        output: crop.output,
        areaPct: Math.round(crop.areaFrac * 1000) / 10,
        aspect: crop.aspect,
        gateDetail: crop.gateDetail,
        estimatedTokensPerFrame: prod.estimateImageTokens(crop.output.width, crop.output.height),
      },
      avgKb:
        Math.round(
          (frames.reduce((sum, f) => sum + f.length * 0.75, 0) / frames.length / 1024) * 10,
        ) / 10,
    };
  }

  // When the crop box is already shorter than the cap, `full` resamples to the same size
  // as `current` with the same quality — the two frame sets are byte-identical and the
  // comparison is vacuous for this swing. That is a RESULT, not a defect (it means we are
  // already sending every pixel the sensor gave us of the golfer), but it must be visible
  // rather than silently paid for twice at the Vision call.
  out.full.identicalToCurrent =
    out.full.crop.output.width === out.current.crop.output.width &&
    out.full.crop.output.height === out.current.crop.output.height;
  out.full.pixelFactor =
    (out.full.crop.output.width * out.full.crop.output.height) /
    (out.current.crop.output.width * out.current.crop.output.height);

  return out;
}

export async function extractFrames({ verbose = true } = {}) {
  const prod = await loadProductionModules(WORK_DIR);

  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(join(CLIPS_DIR, 'manifest.json'), 'utf8'));
  } catch {
    /* optional */
  }
  const specs = resolveSwings(manifest);

  const { server, port } = await serveClips();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

  /** @type {any[]} */
  const swings = [];

  try {
    for (const spec of specs) {
      const clipFile = await findClip(spec.clip);
      const plans = await planSwing(spec, prod);

      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/?clip=${encodeURIComponent(clipFile)}`, {
        waitUntil: 'load',
      });
      const sourceSize = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const v = document.querySelector('video');
            const ready = () => {
              if (v.readyState >= 3) {
                resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
              }
            };
            v.onerror = () => reject(new Error('Failed to load video'));
            v.oncanplaythrough = ready;
            v.onloadeddata = ready;
            ready();
            setTimeout(() => reject(new Error('Video never became playable')), 30000);
          }),
      );

      for (const plan of plans) {
        const profiles = await grabProfiles(page, plan, prod, sourceSize);
        const dir = join(FRAMES_DIR, plan.id);
        for (const [profile, data] of Object.entries(profiles)) {
          await mkdir(join(dir, profile), { recursive: true });
          await Promise.all(
            data.frames.map((b64, i) =>
              writeFile(join(dir, profile, `frame-${String(i + 1).padStart(2, '0')}.jpg`), Buffer.from(b64, 'base64')),
            ),
          );
        }

        const record = {
          id: plan.id,
          clip: clipFile,
          fixture: plan.spec.fixture,
          angle: plan.spec.angle,
          source: sourceSize,
          envelope: plan.envelope,
          selection: plan.selection,
          frameTimes: plan.picks.map((p) => ({ t: Number(p.t.toFixed(3)), phase: p.phase })),
          profiles: Object.fromEntries(
            Object.entries(profiles).map(([k, v]) => [
              k,
              {
                frameCount: v.frames.length,
                crop: v.crop,
                avgKb: v.avgKb,
                ...(k === 'full'
                  ? { identicalToCurrent: v.identicalToCurrent, pixelFactor: v.pixelFactor }
                  : {}),
              },
            ]),
          ),
        };
        await writeJson(join(dir, 'meta.json'), record);
        swings.push(record);

        if (verbose) {
          const c = record.profiles.current;
          const f = record.profiles.full;
          console.log(
            `  ${plan.id.padEnd(18)} ${record.frameTimes.length} frames · ` +
              `current ${c.crop.output.width}×${c.crop.output.height} (${c.avgKb} kB) · ` +
              `full ${f.crop.output.width}×${f.crop.output.height} (${f.avgKb} kB, ${round1(f.pixelFactor)}×` +
              `${f.identicalToCurrent ? ' — IDENTICAL, will not be re-run' : ''}) · ` +
              `crop ${c.crop.reason} ${c.crop.areaPct}%`,
          );
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
    await rm(WORK_DIR, { recursive: true, force: true }).catch(() => {});
  }

  await writeJson(join(FRAMES_DIR, 'index.json'), {
    extractedAt: new Date().toISOString(),
    frameBudget: prod.ANALYSIS_FRAME_COUNT,
    maxOutputSide: prod.MAX_OUTPUT_SIDE,
    frameQuality: FRAME_QUALITY,
    swings: swings.map((s) => s.id),
    /** Swings where `full` differs from `current` at all — the only ones the resolution
     *  comparison can say anything about. */
    resolutionComparable: swings.filter((s) => !s.profiles.full.identicalToCurrent).map((s) => s.id),
  });

  return swings;
}
