// Renderar varje skärm i index.html till PNG (2x) i png/, i ljust och mörkt läge.
// Kör: node docs/design/d1/render.cjs   (kräver playwright; Outfit hämtas från
// node_modules/@fontsource/outfit eftersom Chromium i sandlådan saknar nät).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const out = path.join(dir, 'png');
const fontDir = path.join(dir, '../../../node_modules/@fontsource/outfit/files');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 3200 }, deviceScaleFactor: 2 });
    await page.route('https://fonts.googleapis.com/**', (route) => {
      // Inter finns lokalt installerad; Outfit serveras från fontsource.
      const css = [400, 500, 600, 700].map((w) =>
        `@font-face{font-family:Outfit;font-weight:${w};font-style:normal;src:url(https://fonts.gstatic.com/outfit-${w}.woff2) format('woff2');}`
      ).join('\n');
      route.fulfill({ status: 200, contentType: 'text/css', body: css });
    });
    await page.route('https://fonts.gstatic.com/**', (route) => {
      const w = route.request().url().match(/outfit-(\d+)/)[1];
      route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(fontDir, `outfit-latin-${w}-normal.woff2`)) });
    });
    await page.goto('file://' + path.join(dir, 'index.html') + '?theme=' + theme);
    await page.evaluate(() => document.fonts.ready);
    const phones = await page.$$('.phone');
    for (const ph of phones) {
      const name = await ph.getAttribute('data-screen');
      const fixedDark = (await ph.getAttribute('data-theme')) === 'dark';
      if (fixedDark && theme === 'light') continue; // livesessionen är alltid mörk
      const file = path.join(out, fixedDark ? `${name}.png` : `${name}-${theme}.png`);
      const b = await ph.boundingBox();
      await page.screenshot({ path: file, clip: { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 } });
      console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024) + ' kB');
    }
    await page.close();
  }
  await browser.close();
})();
