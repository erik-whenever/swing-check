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
// EIGHT files: four backend variants, each with a .mjs ES-module loader and a
// .wasm binary. ORT 1.29 resolves BOTH loaders and binaries through the string
// wasmPaths prefix, so all eight must live at the same origin path.
//
//   asyncify  — primary async backend (no JSPI needed, widest browser support)
//   jsep      — WebGPU/JSEP backend (GPU dispatch, falls back to CPU)
//   jspi      — JSPI-based async backend (Chrome 128+ opt-in)
//   (plain)   — synchronous WASM fallback
//
// The string form of wasmPaths (`/ort/`) routes every filename the runtime
// ever requests — including .mjs loaders — to our origin. See the full
// reasoning in shaftDetector.ts (ORT_PATH_PREFIX).

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const OUT_DIR = join(__dirname, '..', 'public', 'ort');

const FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',   // asyncify loader (ES module, ~24 kB)
  'ort-wasm-simd-threaded.asyncify.wasm',  // asyncify binary
  'ort-wasm-simd-threaded.jsep.mjs',       // JSEP/WebGPU loader
  'ort-wasm-simd-threaded.jsep.wasm',      // JSEP binary (~27 MB)
  'ort-wasm-simd-threaded.jspi.mjs',       // JSPI loader
  'ort-wasm-simd-threaded.jspi.wasm',      // JSPI binary
  'ort-wasm-simd-threaded.mjs',            // plain WASM loader
  'ort-wasm-simd-threaded.wasm',           // plain WASM binary (~13 MB)
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
  console.log(`\n✓ Copied ${FILES.length} ORT files to ${OUT_DIR} (${(total / 1024 / 1024).toFixed(1)} MB total)`);
}

main().catch((err) => {
  console.error('✗ Failed to copy ONNX Runtime WASM:', err.message);
  console.error('  Is onnxruntime-web installed? Try: npm install');
  process.exit(1);
});
