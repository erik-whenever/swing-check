import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ["obliged-shimmer-untreated.ngrok-free.dev"],
  },
  plugins: [react(), tailwindcss(), VitePWA({
    // 'prompt' (not 'autoUpdate') so the app can surface an explicit "new version" banner
    // and let the user choose when to reload, via the UpdateBanner component.
    registerType: "prompt",
    manifest: {
      name: "SwingCheck",
      short_name: "SwingCheck",
      description: "Golf swing analyzer",
      theme_color: "#000000",
      background_color: "#000000",
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
    devOptions: { enabled: true },
  }), cloudflare()],
});