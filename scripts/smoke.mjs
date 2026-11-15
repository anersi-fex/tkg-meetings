// End-to-end smoke test for Meetings, against a running app, the local database
// (scripts/local-db/start.sh --reset) and the three stand-ins (scripts/mocks/command-center.mjs on
// :4030, scripts/mocks/claude.mjs on :4031, scripts/mocks/pocket.mjs on :4032). Invented data
// only. Screenshots in test-results/.
//
//   OWNER_PASSWORD=... TEAM_PASSWORD=... node scripts/smoke.mjs [base, default http://127.0.0.1:3000]
//
// The app must run with COMMAND_CENTER_URL=http://127.0.0.1:4030/api/mcp,
// COMMAND_CENTER_TOKEN=test-cc-token, ANTHROPIC_BASE_URL=http://127.0.0.1:4031,
// POCKET_API_BASE=http://127.0.0.1:4032/api/v1/public and no ANTHROPIC_API_KEY or POCKET_API_KEY
// (the test pastes both keys in Settings). Run it on a fresh database.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CC = process.env.CC_MOCK || "http://127.0.0.1:4030";
const AI = process.env.CLAUDE_MOCK || "http://127.0.0.1:4031";
const POCKET = process.env.POCKET_MOCK || "http://127.0.0.1:4032";
const DIALRUSH = process.env.DIALRUSH_MOCK || "http://127.0.0.1:4033";
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

const saveButton = (input) => phone.locator("form", { has: phone.locator(input) }).getByRole("button", { name: "Save and test" });
const tvHeadline = (tv) => tv.locator("main [role=img]").first().getAttribute("aria-label");

await fetch(`${CC}/__reset`, { method: "POST" });
await fetch(`${POCKET}/__reset`, { method: "POST" });
await fetch(`${DIALRUSH}/__reset`, { method: "POST" });
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
  await saveButton("#conn-claude").click();
  await phone.waitForSelector("text=/Claude is connected\\. Drafting 5 slides now\\./", { timeout: 15000 });
  await phone.screenshot({ path: `${OUT}/phone-02-settings.png`, fullPage: true });
});

await check("Pocket: not connected yet points to Settings; a wrong key is refused", async () => {
  await phone.goto(`${BASE}/pocket`);
  await phone.waitForSelector("text=Pocket isn't connected yet");
  await phone.goto(`${BASE}/settings`);
  await phone.fill("#conn-pocket", "pk_wrong_key_000000000000");
  await saveButton("#conn-pocket").click();
  await phone.waitForSelector("text=Pocket refused the key.", { timeout: 15000 });
});

await check("Pocket: the right key connects; the tab lists recordings with Pocket's summary", async () => {
  await phone.fill("#conn-pocket", "pk_test_meetings_key_1234");
  await saveButton("#conn-pocket").click();
  await phone.waitForSelector("text=/Pocket is connected\\. 3 recordings this week\\./", { timeout: 15000 });
  await phone.goto(`${BASE}/pocket`);
  await phone.waitForSelector("text=Closing on Fridays", { timeout: 20000 });
  const text = await phone.locator("main").innerText();
  assert(text.includes("book callbacks for Monday morning before 5 PM"), "Pocket's summary is not shown (as plain text)");
  assert(!text.includes("##") && !text.includes("**"), "the summary still has Markdown in it");
  assert(text.includes("Pocket's summary isn't ready yet"), "a recording without a summary should say so");
  const order = ["A Pocket recording", "Closing on Fridays", "An idea for the website"].map((t) => text.indexOf(t));
  assert(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), `not newest first: ${order}`);
  await phone.screenshot({ path: `${OUT}/phone-12-pocket.png`, fullPage: true });
});

await check("Pocket: Command Center leaves it there (and Undo brings it back)", async () => {
  const card = phone.locator("li", { hasText: "An idea for the website" });
  await card.getByRole("button", { name: "Command Center" }).click();
  await card.getByText("Left to Command Center").waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "Undo" }).click();
  await card.getByRole("button", { name: "Add to meeting" }).waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "Command Center" }).click();
  await card.getByText("Left to Command Center").waitFor({ timeout: 10000 });
  await phone.reload();
  await phone.locator("li", { hasText: "An idea for the website" }).getByText("Left to Command Center").waitFor({ timeout: 10000 });
});

await check("Pocket: Make a meeting adds it to the next meeting, drafted from his words", async () => {
  const card = phone.locator("li", { hasText: "Closing on Fridays" });
  await card.getByRole("button", { name: "Add to meeting" }).click();
  await card.getByText("In the next meeting").waitFor({ timeout: 15000 });
  assert((await json(`${POCKET}/__state`)).read.includes("rec-friday-close"), "the recording was not read in full");
  await phone.goto(`${BASE}/`);
  await phone.waitForFunction(() => document.body.innerText.includes("Closing on Fridays") && !document.body.innerText.includes("Drafting…"), null, { timeout: 40000 });
  assert((await phone.locator("main").innerText()).includes("Two callbacks"), "the draft did not come from the transcript");
  assert(!(await phone.content()).includes("book your callbacks"), "the transcript reached the browser");
  await phone.screenshot({ path: `${OUT}/phone-13-pocket-in-meeting.png`, fullPage: true });
  // A second tap does not add it twice.
  await phone.goto(`${BASE}/pocket`);
  assert((await phone.locator("li", { hasText: "Closing on Fridays" }).getByRole("button", { name: "Add to meeting" }).count()) === 0, "still offers Make a meeting");
});

await check("Pocket: Command Center's card for the same recording does not come in twice", async () => {
  const friday = (await json(`${POCKET}/__state`)).recs.find((r) => r.id === "rec-friday-close");
  await fetch(`${CC}/__add`, { method: "POST", body: JSON.stringify({ id: "card-dup", title: "Fridays: book the callbacks (filed by CC)", summary: "Two callbacks each.", last_said_at: friday.createdAt }) });
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Closing on Fridays", { timeout: 20000 });
  await phone.getByRole("button", { name: "Refresh" }).click().catch(() => undefined);
  await phone.waitForTimeout(2500);
  assert((await phone.locator("text=filed by CC").count()) === 0, "the Command Center copy came in as a second thought");
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
  const state = await tv.evaluate(async () => (await fetch("/api/show?k=")).json());
  total = state.total;
  assert(state.status === "live" && total >= 10, `deck of ${total}`);
  assert(state.deck[0].layout === "cover" && state.deck[1].layout === "scoreboard" && state.deck[2].layout === "agenda" && state.deck.at(-1).layout === "quote", "deck order");
  assert(state.deck.every((s) => !s.notes), "the TV received speaker notes");
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
  const back = await tv.evaluate(async () => (await fetch("/api/show?k=none")).json());
  assert(back.current === total - 2, `Back went to ${back.current}`);
});

await check("the TV (team) cannot move the show with its keys", async () => {
  const before = (await tv.evaluate(async () => (await fetch("/api/show?k=none")).json())).current;
  await tv.keyboard.press("ArrowRight");
  await tv.waitForTimeout(1500);
  const after = (await tv.evaluate(async () => (await fetch("/api/show?k=none")).json())).current;
  assert(before === after, "team moved the show");
});

await check("the clicker gets the speaker notes; Pause keeps the slide and Resume picks up there", async () => {
  const mine = await phone.evaluate(async () => (await fetch("/api/show?k=")).json());
  assert(mine.deck.some((s) => s.notes), "the owner's clicker has no notes");
  const at = mine.current;
  await phone.getByRole("button", { name: "Pause" }).click();
  await tv.waitForSelector('[aria-label="Waiting for the meeting to start"]', { timeout: 8000 });
  await phone.waitForURL((u) => u.pathname === "/", { timeout: 10000 });
  await phone.getByRole("button", { name: "Resume on the TV" }).click();
  await phone.waitForURL(/\/present/);
  await tv.waitForFunction(() => !document.querySelector('[aria-label="Waiting for the meeting to start"]'), null, { timeout: 8000 });
  const now = (await tv.evaluate(async () => (await fetch("/api/show?k=none")).json())).current;
  assert(now === at, `paused at ${at}, resumed at ${now}`);
});

await check("the scoreboard reads Scorecard's month (deleted sales left out)", async () => {
  const state = await tv.evaluate(async () => (await fetch("/api/show?k=")).json());
  const sb = state.deck.find((s) => s.layout === "scoreboard");
  // The seed's life sales: $51,800 this month, $103,300 last month (the slide looks back in the first five days).
  assert(sb && (sb.number === "$51,800" || sb.number === "$103,300"), `scoreboard ${sb?.number}`);
});

await check("End meeting: shown thoughts are marked done in Command Center; the TV waits again", async () => {
  await phone.getByRole("button", { name: "End meeting" }).click();
  // The five Command Center thoughts and the Pocket thought's Command Center twin.
  await phone.waitForSelector("text=/These 6 will be marked done/");
  await phone.screenshot({ path: `${OUT}/phone-07-end.png` });
  await phone.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
  await phone.waitForURL(/\/past/, { timeout: 20000 });
  const cc = await json(`${CC}/__state`);
  assert(cc.done.length === 6 && cc.done.includes("card-dup") && cc.open.length === 0, `done ${cc.done.length}, open ${cc.open.length}`);
  await tv.waitForSelector('[aria-label="Waiting for the meeting to start"]', { timeout: 8000 });
  await phone.screenshot({ path: `${OUT}/phone-08-past.png`, fullPage: true });
});

await check("a new meeting starts empty once everything was covered", async () => {
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Nothing for the team meeting yet", { timeout: 20000 });
  await phone.screenshot({ path: `${OUT}/phone-09-empty.png`, fullPage: true });
});

await check("Pocket: a recording the TV showed reads 'Shown in an earlier meeting' and can be shown again", async () => {
  await phone.goto(`${BASE}/pocket`);
  const card = phone.locator("li", { hasText: "Closing on Fridays" });
  await card.getByText("Shown in an earlier meeting").waitFor({ timeout: 15000 });
  assert((await card.getByRole("button", { name: "Show it again" }).count()) === 1, "no Show it again");
});

await check("next meeting: the TV shows the new deck, not last week's", async () => {
  await fetch(`${CC}/__add`, { method: "POST", body: JSON.stringify({ id: "card-next", title: "Ask for the referral every time", summary: "Every call, ask once." }) });
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Ask for the referral every time", { timeout: 20000 });
  await phone.waitForFunction(() => !document.body.innerText.includes("Drafting…"), null, { timeout: 40000 });
  await phone.getByRole("button", { name: "Play on the TV" }).click();
  await phone.waitForURL(/\/present/);
  await tv.waitForFunction(() => !document.querySelector('[aria-label="Waiting for the meeting to start"]'), null, { timeout: 8000 });
  for (let i = 0; i < 6 && (await phone.getByRole("button", { name: "Next" }).isEnabled()); i++) await phone.getByRole("button", { name: "Next" }).click();
  await tv.waitForTimeout(2500);
  const onPhone = await phone.locator("main [role=img]").first().getAttribute("aria-label");
  const onTv = await tvHeadline(tv);
  assert(onTv === onPhone, `TV shows "${onTv}", clicker shows "${onPhone}"`);
  await phone.getByRole("button", { name: "End meeting" }).click();
  await phone.waitForSelector("text=/This one will be marked done/");
  await phone.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
  await phone.waitForURL(/\/past/, { timeout: 20000 });
  assert((await json(`${CC}/__state`)).done.includes("card-next"), "the shown thought was not marked done");
});

await check("End meeting from Next meeting without the TV marks nothing done", async () => {
  await fetch(`${CC}/__add`, { method: "POST", body: JSON.stringify({ id: "card-later", title: "Clean desks before you leave", summary: "Every night." }) });
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Clean desks before you leave", { timeout: 20000 });
  await phone.waitForFunction(() => !document.body.innerText.includes("Drafting…"), null, { timeout: 40000 });
  await phone.getByRole("button", { name: /End meeting/ }).click();
  await phone.waitForSelector("text=Nothing was shown on the TV");
  await phone.screenshot({ path: `${OUT}/phone-11-end-unshown.png` });
  await phone.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
  await phone.waitForURL(/\/past/, { timeout: 20000 });
  const cc = await json(`${CC}/__state`);
  assert(!cc.done.includes("card-later") && cc.open.includes("card-later"), "a thought the TV never showed was marked done");
});

await check("Pocket: a thought a meeting ended without reaching comes back in the next one", async () => {
  await fetch(`${POCKET}/__add`, { method: "POST", body: JSON.stringify({ id: "rec-carry", title: "Parking lot rule", summary: "Park in the back lot from Monday.", transcript: [{ speaker: "Speaker 1", text: "From Monday, park in the back lot." }] }) });
  await phone.goto(`${BASE}/pocket`);
  const card = phone.locator("li", { hasText: "Parking lot rule" });
  await card.getByRole("button", { name: "Add to meeting" }).click();
  await card.getByText("In the next meeting").waitFor({ timeout: 15000 });
  await phone.goto(`${BASE}/`);
  await phone.waitForFunction(() => document.body.innerText.includes("Parking lot rule") && !document.body.innerText.includes("Drafting…"), null, { timeout: 40000 });
  await phone.getByRole("button", { name: /End meeting/ }).click();
  await phone.waitForSelector("text=Nothing was shown on the TV");
  await phone.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
  await phone.waitForURL(/\/past/, { timeout: 20000 });
  await phone.goto(`${BASE}/pocket`);
  await phone.locator("li", { hasText: "Parking lot rule" }).getByText("In the next meeting").waitFor({ timeout: 15000 });
  await phone.goto(`${BASE}/`);
  await phone.waitForSelector("text=Parking lot rule", { timeout: 20000 });
  assert((await phone.locator("text=Parking lot rule").count()) === 1, "carried twice");
});

await check("small iPhones (320 and 375 pixels): the tab bar fits and the buttons keep one line", async () => {
  for (const width of [320, 375]) {
    const small = await browser.newContext({ ...devices["iPhone 15"], viewport: { width, height: 667 }, storageState: await phoneCtx.storageState() });
    const p = await small.newPage();
    await p.goto(`${BASE}/pocket`);
    const box = await p.locator("nav[aria-label=Main] > div").last().boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= width, `tab bar ${box?.x}..${box && box.x + box.width} on ${width}`);
    const tall = await p.locator("main li button").evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().height > 50).map((b) => b.textContent));
    assert(tall.length === 0, `buttons wrap on ${width}: ${tall.join(", ")}`);
    await p.screenshot({ path: `${OUT}/phone-14-pocket-${width}.png` });
    await small.close();
  }
});

await check("Pocket: Skip hides a recording; Undo brings it back", async () => {
  await fetch(`${POCKET}/__add`, { method: "POST", body: JSON.stringify({ id: "rec-skip", title: "Grocery list", summary: "Milk and eggs.", transcript: [{ speaker: "Speaker 1", text: "Milk and eggs." }] }) });
  await phone.goto(`${BASE}/pocket`);
  await phone.locator("li", { hasText: "Grocery list" }).getByRole("button", { name: "Skip" }).click();
  await phone.waitForSelector("text=/1 skipped · Show/", { timeout: 10000 });
  assert((await phone.locator("main > div > ul li", { hasText: "Grocery list" }).count()) === 0, "a skipped recording still shows");
  await phone.reload();
  await phone.getByRole("button", { name: /1 skipped · Show/ }).click();
  const card = phone.locator("li", { hasText: "Grocery list" });
  await card.getByText("Skipped").waitFor();
  await card.getByRole("button", { name: "Undo" }).click();
  await phone.locator("li", { hasText: "Grocery list" }).getByRole("button", { name: "Whole meeting" }).waitFor({ timeout: 10000 });
});

await check("Pocket: Whole meeting makes a full deck from one recording and switches the rest off", async () => {
  await fetch(`${POCKET}/__add`, { method: "POST", body: JSON.stringify({ id: "rec-whole", title: "Monday kickoff", summary: "Fridays, callbacks and the 4:30 check.", duration: 240, transcript: [{ speaker: "Speaker 1", text: "Fridays are slow. Book your callbacks. Mark checks at 4:30." }] }) });
  await phone.goto(`${BASE}/pocket`);
  const card = phone.locator("li", { hasText: "Monday kickoff" });
  await card.getByRole("button", { name: "Whole meeting" }).click();
  await card.getByRole("radio", { name: /Full/ }).click();
  await card.getByRole("textbox").fill("cut the rambling");
  await phone.screenshot({ path: `${OUT}/phone-15-whole-pick.png`, fullPage: true });
  await card.getByRole("button", { name: "Make the meeting" }).click();
  await phone.locator("li", { hasText: "Monday kickoff" }).getByText("Whole meeting · Full").waitFor({ timeout: 60000 });
  await phone.goto(`${BASE}/`);
  await phone.waitForFunction(() => document.body.innerText.includes("Whole meeting: Monday kickoff") && !document.body.innerText.includes("Drafting…"), null, { timeout: 90000 });
  const text = await phone.locator("main").innerText();
  for (const t of ["Fridays are slow", "Two callbacks each", "The 4:30 check", "Monday mornings"]) assert(text.includes(t), `missing topic ${t}`);
  assert(/4 topics, 1[0-4] slides/.test(text), "the whole meeting card does not say 4 topics and 10 to 14 slides");
  // The other thoughts wait for the next meeting.
  for (const t of ["Parking lot rule", "Clean desks before you leave"]) {
    const on = await phone.locator("main li", { hasText: t }).getByRole("switch").getAttribute("aria-checked");
    assert(on === "false", `"${t}" was not switched off`);
  }
  await phone.screenshot({ path: `${OUT}/phone-16-whole-meeting.png`, fullPage: true });
});

await check("Whole meeting: making it brief redoes it with fewer slides", async () => {
  phone.once("dialog", (d) => d.accept());
  await phone.getByRole("radio", { name: /Brief/ }).click();
  await phone.getByRole("button", { name: "Make it brief" }).click();
  await phone.waitForFunction(() => /2 topics, [34] slides/.test(document.body.innerText) && !document.body.innerText.includes("Drafting…"), null, { timeout: 90000 });
  await phone.reload();
  await phone.waitForFunction(() => !document.body.innerText.includes("Drafting…"), null, { timeout: 90000 });
  assert(!(await phone.locator("main").innerText()).includes("Monday mornings"), "old topics stayed");
});

await check("Each slide: Ask Claude changes it as asked", async () => {
  await phone.getByRole("link", { name: /Fridays are slow/ }).first().click();
  await phone.waitForURL(/\/item\//);
  await phone.getByRole("button", { name: "Split in two" }).click();
  await phone.getByRole("button", { name: "Change it" }).click();
  await phone.waitForFunction(() => document.body.innerText.includes("Changed as") && document.body.innerText.includes("2. Key line"), null, { timeout: 60000 });
  const reqs = await json(`${AI}/__requests`);
  assert(reqs.length > 0, "no Claude requests");
  await phone.screenshot({ path: `${OUT}/phone-17-ask-slide.png`, fullPage: true });
});

await check("Today: Connect DialRush signs in and shows today's connections against the goal", async () => {
  await phone.goto(`${BASE}/today`);
  await phone.getByRole("link", { name: "Connect DialRush" }).click();
  await phone.waitForURL(/\/today\?dialrush=connected/, { timeout: 20000 });
  await phone.waitForSelector("text=DialRush is connected.");
  const text = await phone.locator("main").innerText();
  assert(/37\s*\/\s*100/.test(text), "today's 37 connections against 100 not shown");
  assert(/your one thing/i.test(text), "no one thing");
  assert(/Last 7 days: 79 connections, 7 appointments, 629 dials/.test(text.replace(/\s+/g, " ")), "no week line");
  const st = await json(`${DIALRUSH}/__state`);
  assert(st.calls.some((c) => c.range === "today") && st.calls.some((c) => c.range === "7d"), "stats not read");
  await phone.screenshot({ path: `${OUT}/phone-18-today.png`, fullPage: true });
});

await check("Today: the goal and dial blocks are set in Settings; a met goal says so", async () => {
  await phone.goto(`${BASE}/settings`);
  await phone.fill("#goal", "30");
  await phone.getByRole("button", { name: "Save" }).first().click();
  await phone.waitForSelector("text=Saved.", { timeout: 10000 });
  await phone.goto(`${BASE}/today`);
  await phone.waitForSelector("text=Goal hit");
  await fetch(`${DIALRUSH}/__set`, { method: "POST", body: JSON.stringify({ connects: 5 }) });
  await phone.reload();
  assert(/5\s*\/\s*30/.test(await phone.locator("main").innerText()), "the new number did not show");
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
