// End-to-end smoke test for Meetings, against a running app, the local database
// (scripts/local-db/start.sh --reset) and the two stand-ins (scripts/mocks/command-center.mjs on
// :4030, scripts/mocks/claude.mjs on :4031). Invented data only. Screenshots in test-results/.
//
//   OWNER_PASSWORD=... TEAM_PASSWORD=... node scripts/smoke.mjs [base, default http://127.0.0.1:3000]
//
// The app must run with COMMAND_CENTER_URL=http://127.0.0.1:4030/api/mcp,
// COMMAND_CENTER_TOKEN=test-cc-token, ANTHROPIC_BASE_URL=http://127.0.0.1:4031 and no
// ANTHROPIC_API_KEY (the test pastes a key in Settings). Run it on a fresh database.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CC = process.env.CC_MOCK || "http://127.0.0.1:4030";
const AI = process.env.CLAUDE_MOCK || "http://127.0.0.1:4031";
const OWNER = process.env.OWNER_PASSWORD;
const TEAM = process.env.TEAM_PASSWORD;
if (!OWNER || !TEAM) throw new Error("Set OWNER_PASSWORD and TEAM_PASSWORD");
const OUT = "test-results";
mkdirSync(OUT, { recursive: true });

let passed = 0;
let phone = null;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    failures.push(name);
    await phone?.screenshot({ path: `${OUT}/fail-${failures.length}-phone.png`, fullPage: true }).catch(() => undefined);
    console.log(`FAIL ${name}\n     ${String(err?.message ?? err).split("\n")[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const json = async (url, init) => (await fetch(url, init)).json();

async function signIn(page, password, next = "/") {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.locator("form button[type=submit]").click()]);
}

const tvHeadline = (tv) => tv.locator("main [role=img]").first().getAttribute("aria-label");

await fetch(`${CC}/__reset`, { method: "POST" });
const browser = await chromium.launch();
const phoneCtx = await browser.newContext({ ...devices["iPhone 15"], deviceScaleFactor: 2 });
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
phone = await phoneCtx.newPage();
const tv = await tvCtx.newPage();
const errors = [];
for (const p of [phone, tv]) p.on("pageerror", (e) => errors.push(e.message));

await check("signed out: pages go to sign-in, the API says 401", async () => {
  const r = await fetch(`${BASE}/`, { redirect: "manual" });
  assert(r.status === 307 && r.headers.get("location")?.includes("/login"), `got ${r.status}`);
  assert((await fetch(`${BASE}/api/show`)).status === 401, "api/show not 401");
});

await check("a wrong password is refused", async () => {
  await phone.goto(`${BASE}/login`);
  await phone.fill("#password", "not-the-password");
  await phone.locator("form button[type=submit]").click();
  await phone.waitForSelector("text=/isn.t right/", { timeout: 8000 });
  assert(new URL(phone.url()).pathname === "/login", "left the login page");
});

await check("the team password opens the TV only", async () => {
  await signIn(tv, TEAM, "/tv");
  assert(new URL(tv.url()).pathname === "/tv", `landed on ${tv.url()}`);
  await tv.waitForSelector('[aria-label="Waiting for the meeting to start"]');
  await tv.screenshot({ path: `${OUT}/tv-01-waiting.png` });
  await tv.goto(`${BASE}/settings`);
  assert(new URL(tv.url()).pathname === "/tv", "team reached Settings");
  await tv.goto(`${BASE}/tv`);
});

await check("owner signs in; the Team meeting folder comes in as plain Key lines (no Claude yet)", async () => {
  await signIn(phone, OWNER, "/");
  await phone.waitForSelector("text=Comp increase and the 90-day rule", { timeout: 20000 });
  for (const t of ["The order for writing a policy", "Underwriting callback script", "What the equipment costs", "Outshine me"]) await phone.waitForSelector(`text=${t}`);
  await phone.waitForFunction(() => !document.body.innerText.includes("Drafting…"), null, { timeout: 30000 });
  assert((await phone.locator("text=Check").count()) >= 5, "fallback notes not shown");
  assert((await phone.locator("text=An idea for the website").count()) === 0, "a card from another folder came in");
  await phone.screenshot({ path: `${OUT}/phone-01-no-claude.png`, fullPage: true });
});

await check("Settings: pasting a Claude key connects it and redrafts the five", async () => {
  await phone.goto(`${BASE}/settings`);
  await phone.waitForSelector("text=set in Vercel");
  await phone.fill("#conn-claude", `sk-ant-test-${"x".repeat(32)}`);
  await phone.getByRole("button", { name: "Save and test" }).click();
  await phone.waitForSelector("text=/Claude is connected\\. Drafting 5 slides now\\./", { timeout: 15000 });
  await phone.screenshot({ path: `${OUT}/phone-02-settings.png`, fullPage: true });
});

await check("drafts arrive in the approved layouts", async () => {
  await phone.goto(`${BASE}/`);
  await phone.waitForFunction(() => ["Your raise", "Writing order", "Underwriting", "Equipment", "Outshine me"].every((s) => document.body.innerText.includes(s)) && !document.body.innerText.includes("Drafting…"), null, { timeout: 40000 });
  const text = await phone.locator("main").innerText();
  for (const l of ["Big news", "Step chain", "Script", "Price cards", "Key line"]) assert(text.includes(l), `missing layout ${l}`);
  await phone.screenshot({ path: `${OUT}/phone-03-next-meeting.png`, fullPage: true });
});

await check("every Claude request: the right model, structured output, adaptive thinking, cached prompt", async () => {
  const reqs = (await json(`${AI}/__requests`)).filter((r) => r.structured);
  assert(reqs.length >= 5, `only ${reqs.length} draft requests`);
  for (const r of reqs) {
    assert(r.model === "claude-opus-5-5", `model ${r.model}`);
    assert(r.thinking === "adaptive" && r.effort === "medium" && r.cachedSystem, "request shape");
    assert(r.beta.includes("server-side-fallback-2026-07-01") && r.fallbacks === "default", "fallback beta");
  }
});

let itemUrl = "";
await check("editor: change a line, save, the preview follows", async () => {
  await phone.getByRole("link", { name: /Outshine me/ }).first().click();
  await phone.waitForURL(/\/item\//);
  itemUrl = phone.url();
  const line = phone.getByRole("group", { name: "The line under it" }).locator("input");
  await line.fill("Build your own business here, starting today.");
  await phone.getByRole("button", { name: "Save" }).click();
  await phone.waitForSelector("button:has-text('Saved')", { timeout: 10000 });
  await phone.reload();
  assert((await phone.getByRole("group", { name: "The line under it" }).locator("input").inputValue()) === "Build your own business here, starting today.", "not saved");
  await phone.screenshot({ path: `${OUT}/phone-04-editor.png`, fullPage: true });
});

await check("closing quote: only a line he said in quote marks is offered", async () => {
  await phone.goto(`${BASE}/`);
  await phone.getByRole("button", { name: /Closing quote/ }).click();
  await phone.waitForSelector("text=I want you to outshine me.");
  assert((await phone.locator("text=A line he never said in quotes.").count()) === 0, "an invented quote was offered");
  await phone.screenshot({ path: `${OUT}/phone-05-quote.png` });
  await phone.getByRole("button", { name: /I want you to outshine me\./ }).click();
  await phone.waitForFunction(() => document.body.innerText.includes("“I want you to outshine me.”"), null, { timeout: 10000 });
});

let total = 0;
await check("Play: the TV follows the clicker, slide by slide", async () => {
  await phone.getByRole("button", { name: "Play on the TV" }).click();
  await phone.waitForURL(/\/present/);
  await tv.waitForFunction(() => !document.querySelector('[aria-label="Waiting for the meeting to start"]'), null, { timeout: 8000 });
  const state = await tv.evaluate(async () => (await fetch("/api/show?v=-1")).json());
  total = state.total;
  assert(state.status === "live" && total >= 10, `deck of ${total}`);
  assert(state.deck[0].layout === "cover" && state.deck[1].layout === "scoreboard" && state.deck[2].layout === "agenda" && state.deck.at(-1).layout === "quote", "deck order");
  for (let i = 0; i < total; i++) {
    await tv.waitForTimeout(700);
    await tv.screenshot({ path: `${OUT}/tv-${String(i + 2).padStart(2, "0")}-${state.deck[i].layout}.png` });
    if (i === 0) await phone.screenshot({ path: `${OUT}/phone-06-clicker.png`, fullPage: true });
    if (i < total - 1) {
      const before = await tvHeadline(tv);
      await phone.getByRole("button", { name: "Next" }).click();
      await tv.waitForFunction((b) => document.querySelector("main [role=img]")?.getAttribute("aria-label") !== b, before, { timeout: 5000 });
    }
  }
  await phone.getByRole("button", { name: "Back" }).click();
  await tv.waitForTimeout(1500);
  const back = await tv.evaluate(async () => (await fetch("/api/show?v=0")).json());
  assert(back.current === total - 2, `Back went to ${back.current}`);
});

await check("the TV (team) cannot move the show with its keys", async () => {
  const before = (await tv.evaluate(async () => (await fetch("/api/show?v=0")).json())).current;
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(1500);
  const after = (await tv.evaluate(async () => (await fetch("/api/show?v=0")).json())).current;
  assert(before === after, "team moved the show");
});

await check("the scoreboard reads Scorecard's month (deleted sales left out)", async () => {
  const state = await tv.evaluate(async () => (await fetch("/api/show?v=-1")).json());
  const sb = state.deck.find((s) => s.layout === "scoreboard");
  assert(sb && /\$\d/.test(sb.number) && !sb.number.includes("999"), `scoreboard ${sb?.number}`);
});

await check("End meeting: shown thoughts are marked done in Command Center; the TV waits again", async () => {
  await phone.getByRole("button", { name: "End meeting" }).click();
  await phone.waitForSelector("text=/These 5 will be marked done/");
  await phone.screenshot({ path: `${OUT}/phone-07-end.png` });
  await phone.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
  await phone.waitForURL(/\/past/, { timeout: 20000 });
  const cc = await json(`${CC}/__state`);
  assert(cc.done.length === 5 && cc.open.length === 0, `done ${cc.done.length}, open ${cc.open.length}`);
  await tv.waitForSelector('[aria-label="Waiting for the meeting to start"]', { timeout: 8000 });
  await phone.screenshot({ path: `${OUT}/phone-08-past.png`, fullPage: true });
});

await check("a new meeting starts empty once everything was covered", async () => {
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Nothing for the team meeting yet", { timeout: 20000 });
  await phone.screenshot({ path: `${OUT}/phone-09-empty.png`, fullPage: true });
});

await check("an earlier thought's page is gone with its meeting", async () => {
  const r = await phone.goto(itemUrl);
  assert(r && (r.status() === 404 || new URL(phone.url()).pathname !== new URL(itemUrl).pathname || (await phone.locator("text=/past|ended|not found/i").count()) > 0), "old item still editable");
});

await check("the 12 layouts page renders every approved layout", async () => {
  await phone.goto(`${BASE}/layouts`);
  assert((await phone.locator("[role=img]").count()) >= 12, "fewer than 12 slides");
  await phone.screenshot({ path: `${OUT}/phone-10-layouts.png`, fullPage: true });
});

await check("no page errors", async () => {
  assert(errors.length === 0, errors.join(" | "));
});

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? `: ${failures.join("; ")}` : ""}`);
process.exit(failures.length ? 1 : 0);
