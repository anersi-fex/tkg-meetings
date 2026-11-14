import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDeck, scoreboardSlide, type DeckItem, type DeckMeeting, type ScoreSnapshot } from "../src/lib/deck";
import { percentNotHit } from "../src/lib/money";
import {
  CONTENT_LAYOUTS,
  ContentSlideSchema,
  DRAWN_NOTE,
  cleanSlide,
  coverNotes,
  fallbackSection,
  fallbackSlide,
  isRed,
  limitNotes,
  ringShares,
  switchLayout,
  type ContentSlide,
  type DrawnSlide,
} from "../src/lib/slides";
import { SlideView } from "../src/components/slides/slide";

/** The slide rules of brand/SLIDES.md that the app enforces: one test (or more) per rule fixed. */

const meeting = (over: Partial<DeckMeeting> = {}): DeckMeeting => ({ title: "Team meeting", meetsOn: "2026-11-18", coverLine: "", scoreboard: false, quote: null, ...over });
const key = (statement: string): ContentSlide => ({ layout: "key_line", statement, coral: "", line: "", notes: "" });
const news = (statement: string): ContentSlide => ({ layout: "big_news", statement, line: "", notes: "" });
const number = (title: string): ContentSlide => ({ layout: "big_number", title, number: "90", label: "", pill: "", lines: [], notes: "" });
const item = (id: string, section: string, ...slides: ContentSlide[]): DeckItem => ({ id, section, slides });
const card = (title: string, summary = "", points: string[] = []) => ({ title, summary, points });
const html = (slide: DrawnSlide) => renderToStaticMarkup(createElement(SlideView, { slide, uid: "t" }));
const at = (d: ReturnType<typeof buildDeck>) => d.slides.map((s, i) => `${s.layout}:${d.itemOfSlide[i] ?? "-"}`);

// --- The deck's order and its red slides (finding 13) ------------------------------------------

test("two news thoughts in one section: the first leads with its news, each number stays with its news", () => {
  const d = buildDeck(meeting(), [item("A", "Pay", news("Raises for all."), number("A")), item("B", "Pay", news("Cash bonuses."), number("B")), item("C", "Other", key("Other."))], null, "2026-11-14");
  assert.deepEqual(at(d), ["cover:-", "agenda:-", "big_news:A", "big_number:A", "key_line:B", "big_number:B", "key_line:C"]);
  // The second piece of news keeps its words as a Key line, and the phone says why.
  const b = d.slides[4];
  assert.ok(b.layout === "key_line" && b.statement === "Cash bonuses.");
  assert.match(d.warnings.join(" "), /Two Big news slides in “Pay”/);
});

test("a news thought behind a plain one moves up whole: its number stays right after its news", () => {
  const d = buildDeck(meeting(), [item("A", "Pay", key("A key.")), item("B", "Pay", news("B news."), number("B")), item("C", "Other", key("Other."))], null, "2026-11-14");
  assert.deepEqual(at(d), ["cover:-", "agenda:-", "big_news:B", "big_number:B", "key_line:A", "key_line:C"]);
});

// Plain slides that keep red under a third of these small decks.
const filler = item("F", "Other", key("One."), key("Two."), key("Three."));

test("a thought's own Big news comes first within it", () => {
  const d = buildDeck(meeting(), [item("A", "Pay", key("Intro."), news("Raises.")), filler], null, "2026-11-14");
  assert.deepEqual(at(d), ["cover:-", "agenda:-", "big_news:A", "key_line:A", "key_line:F", "key_line:F", "key_line:F"]);
});

test("of two red slides in a row the later news gives way; the slide after counts only when it can't change", () => {
  // Section One ends on its news and section Two opens with news: the earlier one stays red.
  const d = buildDeck(meeting(), [item("A", "One", news("Raises for all.")), item("B", "Two", news("Cash bonuses."), number("B")), filler], null, "2026-11-14");
  assert.deepEqual(at(d), ["cover:-", "agenda:-", "big_news:A", "key_line:B", "big_number:B", "key_line:F", "key_line:F", "key_line:F"]);
  // A news right before the closing quote gives way to the quote, which always stays red.
  const q = buildDeck(meeting({ quote: { text: "Outshine me.", name: "" } }), [filler, item("B", "Two", news("B."))], null, "2026-11-14");
  assert.deepEqual(at(q), ["cover:-", "agenda:-", "key_line:F", "key_line:F", "key_line:F", "key_line:B", "quote:-"]);
  for (const deck of [d, q]) for (let i = 1; i < deck.slides.length; i++) assert.ok(!(isRed(deck.slides[i - 1]) && isRed(deck.slides[i])));
});

test("every content slide carries the thought it came from, a demoted one too", () => {
  const d = buildDeck(meeting({ quote: { text: "Close.", name: "" } }), [item("A", "Pay", news("Raises.")), item("B", "Pay", news("Bonus."), number("B")), item("C", "Other", key("C."))], null, "2026-11-14");
  d.slides.forEach((s, i) => assert.equal(s.itemId ?? null, d.itemOfSlide[i], `slide ${i + 1}`));
  assert.ok(d.slides.filter((s) => s.itemId).length === 4);
});

// --- Eyebrows (finding 21) ------------------------------------------------------------------------

test("one section and no Agenda: eyebrows carry the name without a number; two sections are numbered", () => {
  const one = buildDeck(meeting(), [item("A", "Pay", key("A.")), item("B", "Pay", number("B"))], null, "2026-11-14");
  assert.ok(!one.slides.some((s) => s.layout === "agenda"));
  assert.deepEqual(one.slides.slice(1).map((s) => s.eyebrow), ["Pay", "Pay"]);
  const two = buildDeck(meeting(), [item("A", "Pay", key("A.")), item("B", "Bonuses", key("B."))], null, "2026-11-14");
  assert.deepEqual(two.slides.slice(2).map((s) => s.eyebrow), ["1 · Pay", "2 · Bonuses"]);
});

// --- The Scoreboard (finding 20) ----------------------------------------------------------------

test("a goal not hit never reads 100%, in the pill or the bar", () => {
  const score: ScoreSnapshot = { monthKey: "2026-11", totalCents: 19_900_000, goalCents: 20_000_000, policies: 4, final: false, daysLeft: "2 business days left", readOn: "2026-11-14" };
  const so = scoreboardSlide(score);
  assert.ok(so.layout === "scoreboard" && so.pill === "99% · 2 business days left" && so.pillTone === "gray" && so.pct === 99 && so.title === "November so far");
  const fin = scoreboardSlide({ ...score, final: true });
  assert.ok(fin.layout === "scoreboard" && fin.pill === "99% of goal" && fin.pct === 99);
  const hit = scoreboardSlide({ ...score, totalCents: 20_000_000 });
  assert.ok(hit.layout === "scoreboard" && hit.pill === "Goal hit · 100%" && hit.pillTone === "green");
  // Away from the goal it rounds the way Scorecard's own board does.
  assert.equal(percentNotHit(5_180_000, 15_000_000), 35);
  assert.equal(percentNotHit(19_999_999, 20_000_000), 99);
  assert.equal(percentNotHit(1, 0), 0);
});

// --- The ring chart (findings 14, 19, 24) -----------------------------------------------------

const chart = (over: Record<string, unknown> = {}) =>
  cleanSlide({ layout: "chart", title: "Your slice", slices: [{ share: 18, label: "You", highlight: true }, { share: 24, label: "Mark" }, { share: 20, label: "" }, { share: 16, label: "Team" }, { share: 12 }, { share: 10 }], center: "", math: ["Your premium"], drawn: true, notes: "You say: hi.", ...over });

test("slice labels are drawn inside the ring: dark on the highlight, light on gray, none when empty", () => {
  const out = html({ ...chart(), eyebrow: "2 · Bonuses" });
  const label = (text: string) => out.match(new RegExp(`<p style="([^"]*)">${text}</p>`))?.[1] ?? "";
  assert.match(label("You"), /color:#0b0d12/);
  assert.match(label("Mark"), /color:#c3c8d4/);
  assert.match(label("Team"), /font-size:calc\(var\(--u\) \* 36\);font-weight:800/);
  // "You" sits on its slice: the first one from 12 o'clock, so up and to the right of the center.
  const pos = (style: string, prop: string) => Number(style.match(new RegExp(`${prop}:calc\\(var\\(--u\\) \\* ([\\d.]+)\\)`))?.[1]);
  assert.ok(pos(label("You"), "left") > 260 && pos(label("You"), "top") < 260);
  // Three labels, no empty ones.
  assert.equal((out.match(/translate\(-50%, -50%\)/g) ?? []).length, 3);
});

test("ring sizes always make a whole circle: scaled to 100 when saved and when drawn, with a note while off", () => {
  assert.deepEqual(ringShares([18, 24, 20, 16, 12]), [20, 27, 22, 18, 13]);
  assert.deepEqual(ringShares([28, 24, 20, 16, 12, 10]), [25, 22, 18, 15, 11, 9]);
  assert.deepEqual(ringShares([25, 75]), [25, 75]);
  assert.deepEqual(ringShares([30, 0, 70]), [30, 0, 70]);
  for (const shares of [[1000, 1, 1, 1, 1, 1], [33, 33, 33], [7, 7, 7, 7, 7, 7]]) assert.equal(ringShares(shares).reduce((a, b) => a + b, 0), 100);
  const saved = chart({ slices: [{ share: 18, highlight: true }, { share: 24 }, { share: 48 }] });
  assert.ok(saved.layout === "chart");
  assert.equal(saved.slices.reduce((a, s) => a + s.share, 0), 100);
  // While he edits, the phone says the sizes are off; at 100 it says nothing.
  const editing: ContentSlide = { ...saved, slices: [{ share: 18, label: "", highlight: true }, { share: 24, label: "", highlight: false }, { share: 48, label: "", highlight: false }] };
  assert.match(limitNotes(editing).find((n) => n.field === "slices")?.message ?? "", /add up to 90, not 100/);
  assert.equal(limitNotes(saved).filter((n) => n.field === "slices").length, 0);
  // The TV draws the editing ring to scale: the slices' dashes cover the whole circle.
  const dashes = [...html({ ...editing }).matchAll(/stroke-dasharray="([\d.]+) /g)].map((m) => Number(m[1]) + 1);
  assert.equal(dashes.reduce((a, b) => a + b, 0), 100);
});

test("a drawn chart says so in its notes, once, and only while it is drawn", () => {
  const c = chart();
  assert.ok(c.layout === "chart" && c.notes === `${DRAWN_NOTE} You say: hi.`);
  assert.equal(cleanSlide(c).notes, c.notes);
  // The template's own words count as saying it.
  const template = chart({ notes: "The slices are a drawing, not anyone’s real share. You say: hi." });
  assert.equal(template.notes, "The slices are a drawing, not anyone’s real share. You say: hi.");
  const real = cleanSlide({ ...c, drawn: false });
  assert.equal(real.notes, "You say: hi.");
  assert.equal(chart({ notes: "" }).notes, DRAWN_NOTE);
});

// --- Price cards (finding 17) ---------------------------------------------------------------------

test("price cards wear icons on every card or on none, on the TV and when saved", () => {
  const mixed: ContentSlide = {
    layout: "price_cards",
    title: "Gear",
    subtitle: "",
    cards: [
      { icon: "headphones", number: "$400", label: "Headphones", highlight: false },
      { icon: "none", number: "$500", label: "Setup", highlight: false },
    ],
    strip: "",
    strip_icon: "none",
    notes: "",
  };
  assert.doesNotMatch(html(mixed), /aria-label="Headphones"/);
  assert.match(limitNotes(mixed).find((n) => n.field === "icons")?.message ?? "", /none show/);
  const saved = cleanSlide(mixed);
  assert.ok(saved.layout === "price_cards" && saved.cards.every((c) => c.icon === "none"));
  const all: ContentSlide = { ...mixed, cards: mixed.cards.map((c) => ({ ...c, icon: "mouse" as const })) };
  assert.equal((html(all).match(/aria-label="Mouse"/g) ?? []).length, 2);
  assert.equal(limitNotes(all).filter((n) => n.field === "icons").length, 0);
  const kept = cleanSlide(all);
  assert.ok(kept.layout === "price_cards" && kept.cards.every((c) => c.icon === "mouse"));
});

// --- Script rows (finding 18) --------------------------------------------------------------------

test("an objection's client row keeps the client's words in curly quotes; rep rows lose only their own", () => {
  const s = cleanSlide({
    layout: "script",
    title: "I need to think",
    rows: [
      { who: "client", text: "“I need to think about it.”" },
      { who: "client", text: 'They say "no way"' },
      { who: "rep", text: "“Totally fair.”" },
      { who: "rep", text: "He said “hi” to me" },
      { who: "rep", text: '"Half quoted' },
    ],
  });
  assert.ok(s.layout === "script");
  assert.deepEqual(
    s.rows.map((r) => r.text),
    ["“I need to think about it.”", "They say “no way”", "Totally fair.", "He said “hi” to me", "Half quoted"],
  );
  assert.deepEqual(cleanSlide(s), s);
  // On the TV the client row shows its quotes as written, in the client row's style.
  assert.match(html({ ...s, rows: s.rows.slice(0, 1) }), /font-style:italic[^>]*>“I need to think about it\.”/);
});

// --- Key line statements (findings 15, 29) ---------------------------------------------------------

test("a third line of a Key line joins the second instead of being dropped", () => {
  const k = cleanSlide({ layout: "key_line", statement: "Ask\n for the\nreferral every time." });
  assert.ok(k.layout === "key_line" && k.statement === "Ask\nfor the referral every time.");
});

test("the fallback Key line stays inside two lines of 19, cut at word breaks, the whole title in the notes", () => {
  const titles = [
    "Stop over-explaining the Social ask on every call",
    "Call your leads back within five minutes, every single time",
    "The order for writing a policy",
    "What the equipment costs",
    "Comp increase and the 90-day rule",
    "Are you logging your dials every single day?",
    "Outshine me",
  ];
  for (const t of titles) {
    const s = fallbackSlide(card(t, "Just ask for it. Keep moving."));
    assert.ok(s.layout === "key_line");
    const lines = s.statement.split("\n");
    assert.ok(lines.length <= 2 && lines.every((l) => l.length <= 19), `${t}: ${JSON.stringify(s.statement)}`);
    assert.deepEqual(limitNotes(s), [], t);
    // His words, in order, whole: the statement is the start of the title.
    const said = s.statement.replace(/\n/g, " ").replace(/[.?]$/, "");
    assert.ok(t.startsWith(said.replace(/[,]$/, "")), `${t}: ${said}`);
    const cut = said.length < t.replace(/[.?]$/, "").length;
    if (cut) {
      assert.ok(s.notes.startsWith(`You say: ${t}`), `${t}: the notes keep the title`);
      // A cut never ends on "the", "on", or an amount without its unit.
      assert.doesNotMatch(said, /\b(the|on|every|within|five)$/i);
    }
  }
  // A question cut short still asks.
  const q = fallbackSlide(card("Are you logging your dials every single day?"));
  assert.ok(q.layout === "key_line" && q.statement.endsWith("?"));
  // Short titles are whole, on even lines.
  const whole = fallbackSlide(card("Comp increase and the 90-day rule"));
  assert.ok(whole.layout === "key_line" && whole.statement === "Comp increase and\nthe 90-day rule.");
});

// --- Fallback sections (finding 16) ---------------------------------------------------------------

test("a fallback section is 1 to 3 topic words from the title, or Ideas", () => {
  assert.equal(fallbackSection("What the equipment costs"), "Equipment costs");
  assert.equal(fallbackSection("The order for writing a policy"), "Order for writing");
  assert.equal(fallbackSection("Comp increase and the 90-day rule"), "Comp increase");
  assert.equal(fallbackSection("Outshine me"), "Outshine me");
  assert.equal(fallbackSection("Are you logging your dials?"), "Logging your dials");
  assert.equal(fallbackSection("How our bonuses work, starting now"), "Bonuses work");
  assert.equal(fallbackSection("The"), "Ideas");
  assert.equal(fallbackSection(""), "Ideas");
  for (const t of ["Stop over-explaining the Social ask", "What’s next for the team"]) assert.ok(fallbackSection(t).split(" ").length <= 3);
  assert.equal(fallbackSection("What’s next for the team"), "Next");
});

// --- Switching layouts (finding 28) -----------------------------------------------------------

test("a layout switch carries every field both layouts have and never cuts a word", () => {
  const bn: ContentSlide = {
    layout: "big_number",
    title: "The 90-day rule",
    number: "90",
    label: "working days",
    pill: "[X]% raise on commission · TBD",
    lines: ["**Logged in** and in the office every day.", "**Not** from your hire date.", "Your raise starts **the next day.**"],
    notes: "You say: ninety.",
  };
  const chartFrom = switchLayout(bn, "chart");
  assert.ok(chartFrom.layout === "chart" && chartFrom.pill === bn.pill && chartFrom.title === bn.title);
  assert.deepEqual(chartFrom.math, ["Logged in and in the office every day.", "Not from your hire date.", "Your raise starts the next day."]);
  const cards = switchLayout(bn, "price_cards");
  assert.ok(cards.layout === "price_cards");
  assert.deepEqual(cards.cards.map((c) => [c.number, c.label]), [["90", "working days"]]);
  assert.equal(cards.strip, "Logged in and in the office every day.");
  const back = switchLayout(cards, "big_number");
  assert.ok(back.layout === "big_number" && back.number === "90" && back.label === "working days");
  // Subtitles travel between the layouts that have one.
  const script = switchLayout({ ...chartFrom, subtitle: "Would you be interested?" }, "script");
  assert.ok(script.layout === "script" && script.subtitle === "Would you be interested?");
  const steps = switchLayout(script, "step_chain");
  assert.ok(steps.layout === "step_chain" && steps.subtitle === "Would you be interested?");
  // A long line becomes a card label whole (the limit note says it is long; nothing is cut).
  const keyLine: ContentSlide = { layout: "key_line", statement: "Paid in cash.\nToday.", coral: "", line: "Everybody gets a bonus, handed to you here.", notes: "" };
  const fromKey = switchLayout(keyLine, "price_cards");
  assert.ok(fromKey.layout === "price_cards" && fromKey.cards[0].label === "Everybody gets a bonus, handed to you here.");
  // Statements end with a period and titles have none; a Key line breaks evenly.
  const asKey = switchLayout({ ...bn, title: "Ask for the referral every time" }, "key_line");
  assert.ok(asKey.layout === "key_line" && asKey.statement === "Ask for the\nreferral every time.");
  const asTitle = switchLayout(asKey, "step_chain");
  assert.ok(asTitle.layout === "step_chain" && asTitle.title === "Ask for the referral every time");
  for (const to of CONTENT_LAYOUTS) assert.ok(ContentSlideSchema.safeParse(switchLayout(bn, to)).success, to);
});

test("a field over its guard length is cut at a word break, not mid-word", () => {
  const long = "word ".repeat(40).trim();
  const s = cleanSlide({ layout: "big_news", statement: long, line: "" });
  assert.ok(s.layout === "big_news" && s.statement.length <= 120 && s.statement.endsWith("word"));
});

// --- The cover's soft limits (finding 22) -------------------------------------------------------

test("the cover's soft limits in plain words", () => {
  assert.deepEqual(coverNotes("Team meeting", "Your raise, cash bonuses, and who writes the policy."), []);
  assert.deepEqual(coverNotes("November team meeting", ""), []);
  const long = coverNotes("November kickoff team meeting and goals", "one two three four five six seven eight nine ten eleven");
  assert.equal(long.length, 2);
  assert.match(long[0], /about 4 lines on the TV/);
  assert.match(long[1], /11 words\. About 10 fit/);
  assert.match(coverNotes("Accountability accountability", "")[0], /29 characters\. About 24 fit/);
});
