// Copy the MediaPipe tasks-vision WASM runtime into public/wasm/ so pose
// detection loads from our own origin instead of jsDelivr (offline-first —
// see BACKLOG D-2). Run with: npm run pose:wasm
//
// Like the .task model, these are large binary assets (~21 MB) fetched from
// node_modules rather than committed — they are gitignored and reproduced on
// demand. The source of truth is the installed @mediapipe/tasks-vision version,
// which keeps the WASM runtime and the JS bindings from drifting apart.
//
// We copy both the SIMD build (used on all modern/target browsers) and the
// nosimd fallback (for the rare browser without WASM SIMD). The ES-module
// (`*_module_*`) variant is not used by FilesetResolver's default path, so we
// skip it to keep the deploy lean.

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const OUT_DIR = join(__dirname, '..', 'public', 'wasm');

const FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let total = 0;
  for (const name of FILES) {
    const src = join(SRC_DIR, name);
    const dst = join(OUT_DIR, name);
    await copyFile(src, dst);
    const { size } = await stat(dst);
    total += size;
    console.log(`✓ ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log(`✓ Copied WASM runtime to ${OUT_DIR} (${(total / 1024 / 1024).toFixed(1)} MB total)`);
}

main().catch((err) => {
  console.error('✗ Failed to copy pose WASM:', err.message);
  console.error('  Is @mediapipe/tasks-vision installed? Try: npm install');
  process.exit(1);
});
