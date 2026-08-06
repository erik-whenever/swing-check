// Reproducibly fetch the MediaPipe PoseLandmarker (lite) model into
// public/models/. Run with: npm run pose:model
//
// The .task file is a binary asset (~5 MB) and is NOT committed — it is
// downloaded on demand so the repo stays lean and the source of truth is
// Google's official model bucket. Re-running is idempotent (skips if present,
// pass --force to re-download).

import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'models');
const OUT_FILE = join(OUT_DIR, 'pose_landmarker_lite.task');

// Pinned to the float16 "latest" lite model published by MediaPipe.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

const force = process.argv.includes('--force');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!force && (await exists(OUT_FILE))) {
    console.log(`✓ Model already present: ${OUT_FILE} (use --force to re-download)`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Downloading pose_landmarker_lite.task …\n  from ${MODEL_URL}`);

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }

  const tmp = `${OUT_FILE}.tmp`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  // Atomic-ish swap so a killed download never leaves a truncated model.
  await rm(OUT_FILE, { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(tmp, OUT_FILE);

  const { size } = await stat(OUT_FILE);
  console.log(`✓ Saved ${OUT_FILE} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('✗ Failed to download pose model:', err.message);
  process.exit(1);
});
