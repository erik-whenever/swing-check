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
const TARGETS = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

/** Build the icon markup for a given pixel size. */
function iconHtml(size) {
  const radius = Math.round(size * 0.22); // iOS-style rounded corners
  const emojiSize = Math.round(size * 0.75); // emoji ≈ 75% of icon height
  const border = Math.max(1.5, size / 128); // thin white border, scaled to size

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
  for (const { size, name } of TARGETS) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(iconHtml(size), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('.icon');
    // omitBackground keeps the area outside the rounded corners transparent.
    await el.screenshot({ path: join(publicDir, name), omitBackground: true });
    console.log(`wrote public/${name} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
