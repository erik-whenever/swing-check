// Generates the PWA / home-screen app icons.
//
// Node's `canvas` cannot render colour emoji, so we render a small HTML document in
// headless Chrome (via Puppeteer) where the 🏌️ emoji rasterises correctly, then take
// pixel-exact screenshots at each required size.
//
// Run with: node scripts/generate-icons.mjs
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// size = output pixel dimension, name = output filename.
// maskable = full-bleed square with the emoji pulled into the safe zone so
// Android/iOS mask shapes (circle, squircle, …) never clip it or expose corners.
const TARGETS = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 512, name: 'icon-maskable-512.png', maskable: true },
];

/** Build the icon markup for a given pixel size. */
function iconHtml(size, maskable = false) {
  // Maskable icons must fill the whole square (the OS applies the mask), so no
  // rounded corners; and the emoji shrinks to sit inside the ~80% safe zone.
  const radius = maskable ? 0 : Math.round(size * 0.22); // iOS-style rounded corners
  const emojiSize = Math.round(size * (maskable ? 0.55 : 0.75));
  const border = maskable ? 0 : Math.max(1.5, size / 128); // thin white border, scaled to size

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { background: transparent; }
      .icon {
        width: ${size}px;
        height: ${size}px;
        border-radius: ${radius}px;
        background: linear-gradient(135deg, #0f3d2e 0%, #1a6645 100%);
        border: ${border}px solid rgba(255, 255, 255, 0.1);
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /* Subtle darker ground-shadow ellipse near the bottom. */
      .ground {
        position: absolute;
        left: 15%;
        bottom: 6%;
        width: 70%;
        height: 16%;
        background: #0a2e20;
        border-radius: 50%;
        filter: blur(${Math.round(size * 0.02)}px);
        opacity: 0.85;
      }
      .emoji {
        position: relative;
        font-size: ${emojiSize}px;
        line-height: 1;
        font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
      }
    </style>
  </head>
  <body>
    <div class="icon">
      <div class="ground"></div>
      <span class="emoji">🏌️</span>
    </div>
  </body>
</html>`;
}

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const { size, name, maskable = false } of TARGETS) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(iconHtml(size, maskable), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('.icon');
    // omitBackground keeps the area outside the rounded corners transparent; a
    // maskable icon must stay fully opaque so the OS mask has something to clip.
    await el.screenshot({ path: join(publicDir, name), omitBackground: !maskable });
    console.log(`wrote public/${name} (${size}x${size})${maskable ? ' [maskable]' : ''}`);
  }
} finally {
  await browser.close();
}
