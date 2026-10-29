// Build one meeting page: inline the brand CSS and fonts into a single HTML file, write a copy
// without the document wrapper (for publishing as an artifact), then render a PDF and phone
// screenshots (light and dark) with Playwright.
//
//   node scripts/build.mjs meetings/<name>.html [outDir]
//
// Output (outDir, default build/): <name>.html (single file), <name>.artifact.html (fragment),
// <name>.pdf (letter, light), <name>-phone-light.png and <name>-phone-dark.png.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const [, , input, outArg] = process.argv;
if (!input) {
  console.error("usage: node scripts/build.mjs meetings/<name>.html [outDir]");
  process.exit(1);
}
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = resolve(outArg || join(root, "build"));
mkdirSync(outDir, { recursive: true });
const name = basename(input).replace(/\.html$/, "");

const src = readFileSync(resolve(input), "utf8");
const brandDir = join(root, "brand");

function inlineFonts(css) {
  return css.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, rel) => {
    const b64 = readFileSync(join(brandDir, rel)).toString("base64");
    return `url(data:font/woff2;base64,${b64})`;
  });
}
const fontsCss = inlineFonts(readFileSync(join(brandDir, "fonts.css"), "utf8"));
const tideCss = readFileSync(join(brandDir, "tide.css"), "utf8");

// One file: the two <link>s become one <style>.
const single = src
  .replace(/<link rel="stylesheet" href="\.\.\/brand\/fonts\.css">\s*/, "")
  .replace(/<link rel="stylesheet" href="\.\.\/brand\/tide\.css">/, `<style>\n${fontsCss}\n${tideCss}\n</style>`);
writeFileSync(join(outDir, `${name}.html`), single);

// The artifact fragment: title, meta and style, then the body's content, no document wrapper.
const head = single.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset="utf-8">\s*/, "")
  .replace(/<meta name="viewport"[^>]*>\s*/, "");
const body = single.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync(join(outDir, `${name}.artifact.html`), `${head.trim()}\n${body.trim()}\n`);

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: scheme });
  await page.setContent(single, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, `${name}-phone-${scheme}.png`), fullPage: true });
  await page.close();
}
const pdfPage = await browser.newPage({ colorScheme: "light" });
await pdfPage.setContent(single, { waitUntil: "load" });
await pdfPage.evaluate(() => document.fonts.ready);
await pdfPage.emulateMedia({ media: "print", colorScheme: "light" });
await pdfPage.pdf({ path: join(outDir, `${name}.pdf`), format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" } });
await browser.close();
console.log(`built ${name} into ${outDir}`);
