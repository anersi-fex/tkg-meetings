// node render-boards.mjs <design.html> <outPrefix>
// Renders #tv (1920x1080, dark) and #phone (393x852, light) artboards to PNG.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const [,, html, out] = process.argv;
const browser = await chromium.launch();
const url = 'file://' + resolve(html);
for (const [id, scheme, w, h] of [['tv', 'dark', 1920, 1080], ['phone', 'light', 393, 852], ['flow', 'light', 1200, 420]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: id === 'phone' ? 2 : 1, colorScheme: scheme });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$('#' + id);
  if (el) { await el.screenshot({ path: `${out}-${id}.png` }); console.log('wrote', `${out}-${id}.png`); }
  else console.log('missing #' + id);
  await page.close();
}
await browser.close();
