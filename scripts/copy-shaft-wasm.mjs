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
// ONE file, unlike the MediaPipe pair. `shaftDetector.ts` imports
// `onnxruntime-web/wasm`, whose bundle already carries the Emscripten loader
// inlined, so only the runtime binary has to be hosted — and it names that binary
// explicitly (`wasmPaths: { wasm }`) rather than pointing ORT at this directory,
// because a directory prefix makes ORT `import()` the loader from here too and
// Vite's dev server refuses to serve a `public/` file to an import. The reasoning
// lives next to `WASM_URL` in shaftDetector.ts.
//
// ONE variant, not four, for the same reason: the jsep (WebGPU), jspi and asyncify
// builds are 16–28 MB each and unreachable from that entry point — copying them
// would add ~70 MB to the deploy for code that never asks for them.

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const OUT_DIR = join(__dirname, '..', 'public', 'ort');

const FILES = ['ort-wasm-simd-threaded.wasm'];

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
