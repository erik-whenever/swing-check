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
// THREE .wasm binaries — one per backend variant ORT may select at runtime:
//
//   plain         — synchronous WASM fallback
//   asyncify      — primary async backend (no JSPI needed, widest support)
//   jsep          — WebGPU/JSEP backend (GPU dispatch, CPU fallback)
//
// The .mjs ES-module loaders that ship alongside these in dist/ are NOT copied
// because ORT uses its own bundled loader code (already included in the
// onnxruntime-web/webgpu import) rather than fetching external .mjs files.
// Using the object form of wasmPaths (instead of a string prefix) is what
// enables this — see shaftDetector.ts (ORT_WASM_PATHS) for the reasoning.
// Trying to serve the .mjs files from public/ort/ and using the string prefix
// causes Vite's dev-server to reject the dynamic import() ORT issues for them.

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const OUT_DIR = join(__dirname, '..', 'public', 'ort');

const FILES = [
  'ort-wasm-simd-threaded.wasm',           // plain WASM binary (~13 MB)
  'ort-wasm-simd-threaded.asyncify.wasm',  // asyncify binary (~25 MB)
  'ort-wasm-simd-threaded.jsep.wasm',      // JSEP/WebGPU binary (~27 MB)
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
    // kB below a megabyte: the ~24 kB loader printed as "0.0 MB" reads like a
    // failed copy, and that file is exactly the one whose absence is hard to debug.
    const human =
      size >= 1024 * 1024
        ? `${(size / 1024 / 1024).toFixed(1)} MB`
        : `${Math.round(size / 1024)} kB`;
    console.log(`✓ ${name} (${human})`);
  }
  console.log(`\n✓ Copied ${FILES.length} ORT .wasm binaries to ${OUT_DIR} (${(total / 1024 / 1024).toFixed(1)} MB total)`);
}

main().catch((err) => {
  console.error('✗ Failed to copy ONNX Runtime WASM:', err.message);
  console.error('  Is onnxruntime-web installed? Try: npm install');
  process.exit(1);
});
