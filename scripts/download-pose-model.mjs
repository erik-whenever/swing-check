// Reproducibly fetch the MediaPipe PoseLandmarker (lite) model into
// public/models/. Run with: npm run pose:model
//
// The .task file is a binary asset (~5 MB) and is NOT committed — it is
// downloaded on demand so the repo stays lean and the source of truth is
// Google's official model bucket.
//
// N-7: URL and sha256 come from apps/mobile/modules/pose/models.json, the same
// table the app's Gradle build and training/pose_parity.py read. The URL is a
// versioned address (float16/1), never `latest`, and the download fails on a
// hash mismatch — so web and app can't silently drift onto different models
// (the web's poseEnvelope/poseSegments thresholds are calibrated on this file).
//
// Re-running is idempotent: a present file with the right hash is kept; a
// present file with the wrong hash is replaced. --force re-downloads anyway.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
export const MODELS_JSON = join(ROOT, 'apps', 'mobile', 'modules', 'pose', 'models.json');
const OUT_DIR = join(ROOT, 'public', 'models');

// The web runs lite only (src/lib/poseDetector.ts loads /models/pose_landmarker_lite.task).
const WEB_MODEL = 'lite';

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Validates and returns one entry of the shared model table. */
export function modelEntry(table, name) {
  const m = table?.[name];
  if (!m || typeof m !== 'object') throw new Error(`models.json: no entry "${name}"`);
  const { file, url, sha256 } = m;
  if (typeof file !== 'string' || !/^[\w.-]+\.task$/.test(file)) {
    throw new Error(`models.json: ${name}.file must be a plain *.task file name`);
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error(`models.json: ${name}.url must be https`);
  }
  if (/\/latest\//.test(url)) {
    throw new Error(`models.json: ${name}.url must be a versioned address, not latest`);
  }
  if (!url.endsWith(`/${file}`)) throw new Error(`models.json: ${name}.url does not end in ${file}`);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error(`models.json: ${name}.sha256 must be 64 lowercase hex chars`);
  }
  return { file, url, sha256 };
}

async function readOrNull(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Makes sure `outDir/entry.file` exists with `entry.sha256`. Downloads with
 * `fetchImpl` when missing, wrong or forced; writes via a .part file and never
 * leaves it (or a mismatching model) behind on failure.
 * Returns 'kept' | 'downloaded'.
 */
export async function ensureModel({ entry, outDir, fetchImpl = fetch, force = false, log = () => {} }) {
  const outFile = join(outDir, entry.file);
  const present = force ? null : await readOrNull(outFile);
  if (present) {
    const got = sha256Hex(present);
    if (got === entry.sha256) return 'kept';
    log(`  ${entry.file} present but sha256 ${got} ≠ ${entry.sha256} — re-downloading`);
  }

  await mkdir(outDir, { recursive: true });
  const tmp = `${outFile}.part`;
  try {
    const res = await fetchImpl(entry.url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${res.statusText} (${entry.url})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const got = sha256Hex(bytes);
    if (got !== entry.sha256) {
      throw new Error(`${entry.file}: sha256 ${got}, expected ${entry.sha256} (${entry.url})`);
    }
    await writeFile(tmp, bytes);
    await rename(tmp, outFile);
    return 'downloaded';
  } catch (err) {
    await rm(tmp, { force: true });
    // A stale model with the wrong hash must not stay usable either.
    if (present) await rm(outFile, { force: true });
    throw err;
  }
}

async function main(argv) {
  const table = JSON.parse(await readFile(MODELS_JSON, 'utf8'));
  const entry = modelEntry(table, WEB_MODEL);
  console.log(`Pose model ${entry.file}\n  from ${entry.url}\n  sha256 ${entry.sha256}`);
  const result = await ensureModel({
    entry,
    outDir: OUT_DIR,
    force: argv.includes('--force'),
    log: (msg) => console.log(msg),
  });
  console.log(
    result === 'kept'
      ? `✓ Already present with matching sha256 (use --force to re-download)`
      : `✓ Downloaded and verified ${join(OUT_DIR, entry.file)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error('✗ Failed to download pose model:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
