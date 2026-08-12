// Bundles the PRODUCTION selection/prompt modules out of src/lib so the harness runs the
// real thing instead of a re-implementation. Nothing here modifies them — esbuild reads
// them, we import the result.
//
// Why esbuild and not a plain import: src/lib is TypeScript. The vitest suites can import
// it directly because vite transforms on the fly; a plain `node scripts/…` cannot. esbuild
// ships with vite, so this adds no dependency.
//
// Why this is safe to bundle at all: poseEnvelope / poseEnvelopeSelection / poseSegments /
// poseCropBox / prompt import their heavy neighbours (poseTrajectory → poseDetector →
// @mediapipe, frameExtractor) as `import type` ONLY, so the bundle contains no MediaPipe,
// no browser globals and no side effects.

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');
const SRC_LIB = join(REPO_ROOT, 'src', 'lib');

/**
 * Constants that live in modules we deliberately do NOT bundle (frameExtractor pulls in
 * the whole pose stack). Read out of the source text instead of being copied, so the
 * harness cannot silently drift from production when the number changes.
 */
async function readConstant(file, name) {
  const text = await readFile(join(SRC_LIB, file), 'utf8');
  const match = text.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!match) {
    throw new Error(
      `Could not read ${name} from src/lib/${file}. The harness reads it out of the ` +
        `source on purpose — fix this regex rather than hardcoding the value.`,
    );
  }
  return Number(match[1]);
}

let cached = null;

/**
 * Bundle and import the production modules. Cached per process.
 *
 * @returns the production selection + prompt API, plus the production constants.
 */
export async function loadProductionModules(outDir) {
  if (cached) return cached;

  const entry = `
    export { detectSwingEnvelope } from './poseEnvelope';
    export { selectEnvelopeFrames } from './poseEnvelopeSelection';
    export { detectSessionSwings, segmentSwingCandidates } from './poseSegments';
    export { computeLandmarkBounds, planCrop, estimateImageTokens, MAX_OUTPUT_SIDE } from './poseCropBox';
    export { SYSTEM_PROMPT, buildSwingPrompt, buildFrameCountNote } from './prompt';
  `;

  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, 'production-bundle.mjs');

  await build({
    stdin: { contents: entry, resolveDir: SRC_LIB, sourcefile: 'harness-entry.ts', loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: outFile,
    logLevel: 'silent',
  });

  const mod = await import(pathToFileURL(outFile).href);

  cached = {
    ...mod,
    /** Production frame budget — read from frameExtractor.ts, never copied. */
    ANALYSIS_FRAME_COUNT: await readConstant('frameExtractor.ts', 'ANALYSIS_FRAME_COUNT'),
    /** Production long-side cap for session frames — read from poseCropBox.ts. */
    MAX_OUTPUT_SIDE: mod.MAX_OUTPUT_SIDE,
  };
  return cached;
}

/** Load a frozen landmark fixture from src/lib/__fixtures__. */
export async function loadFixture(name) {
  const path = join(SRC_LIB, '__fixtures__', `${name}.json`);
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  return parsed.samples;
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}
