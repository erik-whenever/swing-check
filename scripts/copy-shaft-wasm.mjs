// Copy the onnxruntime-web WASM runtime into public/ort/ so the shaft detector
// loads from our own origin instead of jsDelivr — the same rule the MediaPipe
// runtime follows (see copy-pose-wasm.mjs, BACKLOG D-2). Run with:
// `npm run shaft:wasm`.
//
// Like the pose assets these are large binaries fetched from node_modules rather
// than committed: gitignored, reproduced on demand, and guaranteed to match the
// installed `onnxruntime-web` version. A runtime/JS-binding mismatch in ONNX
// Runtime fails as an opaque abort inside the WASM module, so pinning the source
// of truth to node_modules is not a nicety.
//
// TWO files: the regular WASM binary (WASM EP fallback) and the JSEP binary (WebGPU).
// `shaftDetector.ts` imports `onnxruntime-web/webgpu` (the JSEP backend), which
// includes both the Emscripten loader inlined AND the ability to run on GPU or CPU.
// Both binaries are served from /ort/ with a string path prefix — safe since ORT 1.29
// uses Emscripten ≥3.1.58 where locateFile() is only called for .wasm files (not
// .mjs loaders), so the Vite dev-server restriction on importing files from public/
// does not apply. The reasoning lives next to ORT_PATH_PREFIX in shaftDetector.ts.

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const OUT_DIR = join(__dirname, '..', 'public', 'ort');

const FILES = [
  'ort-wasm-simd-threaded.wasm',       // WASM EP fallback (~13 MB)
  'ort-wasm-simd-threaded.jsep.wasm',  // JSEP backend for WebGPU (~27 MB)
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
    // kB below a megabyte: the 24 kB loader printed as "0.0 MB" reads like a
    // failed copy, and that file is exactly the one whose absence is hard to debug.
    const human =
      size >= 1024 * 1024
        ? `${(size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(size / 1024)} kB`;
    console.log(`✓ ${name} (${human})`);
  }
  console.log(`✓ Copied ONNX Runtime WASM to ${OUT_DIR} (${(total / 1024 / 1024).toFixed(1)} MB total)`);
}

main().catch((err) => {
  console.error('✗ Failed to copy ONNX Runtime WASM:', err.message);
  console.error('  Is onnxruntime-web installed? Try: npm install');
  process.exit(1);
});
