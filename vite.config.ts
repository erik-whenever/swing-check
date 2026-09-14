import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * Build identity, exposed as `import.meta.env.VITE_APP_VERSION`.
 *
 * Written into the shaft dataset's `manifest.json` (see src/lib/dataset/) so an
 * exported set can be traced back to the code that selected its frames — the frame
 * selection is the thing under active development, so "which build produced this"
 * is the first question a surprising dataset raises. Falls back to the package
 * version alone outside a git checkout; never fails the build.
 */
function buildVersion(): string {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync("package.json", "utf8")).version ?? version;
  } catch { /* keep the fallback */ }
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return sha ? `${version}+${sha}` : version;
  } catch {
    return version;
  }
}

/**
 * Stop Vite from emitting a SECOND copy of ONNX Runtime's WASM binary.
 *
 * `onnxruntime-web`'s bundled build carries a fallback
 * `new URL("ort-wasm-simd-threaded.wasm", import.meta.url)` for the case where no
 * `env.wasm.wasmPaths` is set. Vite reads that as an asset reference and emits the
 * 13.3 MB binary into `dist/assets/` under a content hash — where nothing ever
 * fetches it, because `shaftDetector.ts` sets `wasmPaths` to `/ort/` and ORT's
 * `locateFile` override wins. The result is 13.3 MB of dead weight in every deploy.
 *
 * Rewriting the fallback to the self-hosted path removes the asset reference AND
 * makes the fallback correct rather than merely unused: if `wasmPaths` were ever
 * dropped, ORT would still land on our own origin instead of a hashed build
 * artefact. Build only — the dev server serves the dep straight from node_modules
 * and never emits the copy.
 */
function ortSelfHostedWasm() {
  const FALLBACK = /new URL\((["'])(ort-wasm-simd-threaded[\w.]*\.wasm)\1\s*,\s*import\.meta\.url\)/g;
  return {
    name: "ort-self-hosted-wasm",
    apply: "build" as const,
    transform(code: string, id: string) {
      if (!id.includes("onnxruntime-web") || !FALLBACK.test(code)) return null;
      FALLBACK.lastIndex = 0;
      return {
        code: code.replace(FALLBACK, 'new URL("/ort/$2", self.location.origin)'),
        map: null,
      };
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(buildVersion()),
  },
  server: {
    host: true,
    allowedHosts: ["obliged-shimmer-untreated.ngrok-free.dev"],
  },
  plugins: [react(), tailwindcss(), ortSelfHostedWasm(), VitePWA({
    // 'prompt' (not 'autoUpdate') so the app can surface an explicit "new version" banner
    // and let the user choose when to reload, via the UpdateBanner component.
    registerType: "prompt",
    manifest: {
      name: "SwingCheck",
      short_name: "SwingCheck",
      description: "Golf swing analyzer",
      // "Club Cream": the install splash and OS chrome should already be the app's
      // paper tone, not a black frame the cream UI then jumps out of.
      theme_color: "#f5f1e8",
      background_color: "#f5f1e8",
      display: "standalone",
      orientation: "portrait",
      scope: "/",
      start_url: "/",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // Dedicated full-bleed maskable icon (safe-zone padded) so Android/iOS masks don't clip it.
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      // Precache the pose model (~5 MB) and the SIMD WASM runtime (~11 MB) so
      // pose detection runs offline with zero cross-origin requests (BACKLOG
      // D-2). The nosimd fallback is served same-origin and runtime-cached on
      // demand (see below) rather than precached, to keep install lean.
      globPatterns: [
        // woff2: the bundled Outfit subset — without it the offline PWA falls back to
        // a system face and the whole layout reflows on the range.
        "**/*.{js,css,html,ico,png,svg,woff2}",
        "models/*.task",
        "wasm/vision_wasm_internal.{js,wasm}",
      ],
      // Default is 2 MiB; the WASM binary alone is ~11 MB.
      maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      runtimeCaching: [
        {
          // Catches the nosimd WASM fallback (and anything under /wasm/ not
          // precached) so even no-SIMD browsers stay same-origin and offline
          // after the first load.
          urlPattern: ({ url, sameOrigin }) =>
            sameOrigin && url.pathname.startsWith("/wasm/"),
          handler: "CacheFirst",
          options: {
            cacheName: "pose-wasm",
            expiration: { maxEntries: 6 },
          },
        },
        {
          // Shaft detector (Ström S): the ONNX model (~12.4 MB) and ONNX Runtime's
          // WASM (~13.3 MB), both served same-origin like the pose assets above.
          //
          // RUNTIME-CACHED, NOT PRECACHED — the one place this pattern deliberately
          // differs from pose. Precaching would add ~26 MB to every install, more
          // than doubling it, for a detector whose only caller today sits behind
          // VITE_DEV_PREVIEW: every production user would pay the download and no
          // production user would run it. CacheFirst gives the same end state where
          // it matters — one slow first run, fully offline afterwards — and moves
          // the cost to whoever actually opens the view. Move these into
          // `globPatterns` the day shaft detection joins the analysis path, because
          // then "first use" is every user's first swing.
          urlPattern: ({ url, sameOrigin }) =>
            sameOrigin && (url.pathname.startsWith("/ort/") || url.pathname.endsWith(".onnx")),
          handler: "CacheFirst",
          options: {
            cacheName: "shaft-runtime",
            expiration: { maxEntries: 4 },
          },
        },
      ],
    },
    devOptions: { enabled: true },
  }), cloudflare()],
});