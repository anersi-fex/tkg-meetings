// Render the slide templates (brand/slides/*.html, the Slides artifact format) to PNGs and one
// contact sheet, with the brand fonts from brand/fonts. A small shim stands in for the deck
// viewer: no default margins, border-box sizing, notes hidden, the block arrow drawn.
//
//   node scripts/render-slides.mjs [outDir] [slide.html ...]
//
// Defaults: every brand/slides/NN-*.html, into build/slides/. Writes NN-name.png per slide and
// contact-sheet.png (all slides in a 3-column grid with their layout names).
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const [, , outArg, ...given] = process.argv;
const outDir = resolve(outArg || join(root, "build", "slides"));
mkdirSync(outDir, { recursive: true });
const slideDir = join(root, "brand", "slides");
const files = given.length
  ? given.map((f) => resolve(f))
  : readdirSync(slideDir).filter((f) => /^\d\d-.+\.html$/.test(f)).sort().map((f) => join(slideDir, f));

const font = (f) => pathToFileURL(join(root, "brand", "fonts", f)).href;
const SHIM = `
@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:200 800;src:url(${font("plus-jakarta-sans-latin-wght-normal.woff2")}) format("woff2-variations")}
@font-face{font-family:"Plus Jakarta Sans";font-style:italic;font-weight:200 800;src:url(${font("plus-jakarta-sans-latin-wght-italic.woff2")}) format("woff2-variations")}
@font-face{font-family:"Space Grotesk";font-style:normal;font-weight:300 700;src:url(${font("space-grotesk-latin-wght-normal.woff2")}) format("woff2-variations")}
html,body{margin:0;padding:0;background:#000}
section{position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box}
section *{margin:0;box-sizing:border-box}
section aside{display:none}
section svg{display:block;flex:none}
section hr{border:0}
x-shape{display:block;flex:none}
x-shape[kind="arrow-right"]{clip-path:polygon(0 30%,60% 30%,60% 0,100% 50%,60% 100%,60% 70%,0 70%)}
`;

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const shots = [];
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const name = basename(file).replace(/\.html$/, "");
  // A page on disk, so the file:// fonts load (a page set from a string cannot read local files).
  const wrapper = join(outDir, `${name}.page.html`);
  writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><style>${SHIM}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(wrapper).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = join(outDir, `${name}.png`);
  await page.locator("section").first().screenshot({ path: out });
  shots.push({ name, out });
}

const label = (n) => n.replace(/^(\d\d)-/, "$1 · ").replace(/-/g, " ");
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>${SHIM}
body{background:#f2f3f7;font-family:"Plus Jakarta Sans",sans-serif;padding:40px}
.grid{display:grid;grid-template-columns:repeat(3,600px);gap:32px 28px}
figure{margin:0}img{width:600px;height:338px;border-radius:14px;display:block;box-shadow:0 8px 24px rgba(21,23,28,.12)}
figcaption{margin-top:10px;font-size:20px;font-weight:700;color:#15171c;text-transform:capitalize}
h1{margin:0 0 28px;font-size:36px;font-weight:800;letter-spacing:-1px;color:#15171c}</style></head>
<body><h1>Team meeting slides: the 12 layouts</h1><div class="grid">${shots
  .map((s) => `<figure><img src="${pathToFileURL(s.out).href}"><figcaption>${label(s.name)}</figcaption></figure>`)
  .join("")}</div></body></html>`;
const sheetPage = await browser.newPage({ viewport: { width: 1940, height: 800 } });
const sheetFile = join(outDir, "contact-sheet.page.html");
writeFileSync(sheetFile, sheet);
await sheetPage.goto(pathToFileURL(sheetFile).href, { waitUntil: "load" });
await sheetPage.evaluate(() => document.fonts.ready);
await sheetPage.screenshot({ path: join(outDir, "contact-sheet.png"), fullPage: true });
await browser.close();
console.log(`rendered ${shots.length} slides and contact-sheet.png into ${outDir}`);
