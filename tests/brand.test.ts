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
  STATEMENT_MAX_WIDTH,
  cleanSlide,
  coverNotes,
  fallbackSection,
  fallbackSlide,
  isRed,
  limitNotes,
  ringShares,
  shownNotes,
  statementFit,
  statementWidth,
  switchLayout,
  type ContentSlide,
  type DrawnSlide,
} from "../src/lib/slides";
import { SlideView } from "../src/components/slides/slide";
import { SAMPLE_DECK } from "../src/lib/sample-deck";

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

test("a drawn chart says so in the notes he reads on the TV day, never in the notes he edits", () => {
  // Stored notes stay his: Save never adds the line, so deleting it never fights him.
  const c = chart();
  assert.ok(c.layout === "chart" && c.drawn && c.notes === "You say: hi.");
  // An earlier version stored it: the exact line goes, in every layout it followed the slide to.
  assert.equal(cleanSlide({ ...c, notes: `${DRAWN_NOTE} You say: hi.` }).notes, "You say: hi.");
  assert.equal(cleanSlide({ layout: "key_line", statement: "Paid in cash.", notes: `${DRAWN_NOTE} You say: hi.` }).notes, "You say: hi.");
  assert.equal(switchLayout(cleanSlide({ ...c, notes: `${DRAWN_NOTE} You say: hi.` }), "big_number").notes, "You say: hi.");
  // The deck's copy opens with it, once, and only while the Drawn switch is on.
  assert.equal(shownNotes(c), `${DRAWN_NOTE} You say: hi.`);
  assert.equal(shownNotes(chart({ notes: "" })), DRAWN_NOTE);
  assert.equal(shownNotes(chart({ notes: "The slices are a drawing, not anyone’s real share. You say: hi." })), "The slices are a drawing, not anyone’s real share. You say: hi.");
  assert.equal(shownNotes(cleanSlide({ ...c, drawn: false })), "You say: hi.");
  assert.equal(shownNotes(key("Paid in cash.")), "");
  // The line never pushes the stored notes past their cap.
  assert.equal(chart({ notes: "x".repeat(4000) }).notes.length, 4000);
});

// --- Price cards (finding 17) ---------------------------------------------------------------------

test("price cards wear icons on every card or on none on the TV, and Save keeps every icon he picked", () => {
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
  assert.match(limitNotes(mixed).find((n) => n.field === "icons")?.message ?? "", /the TV shows none\. Your picks are kept/);
  // A card he added and typed into before picking its icon wipes nothing: the picks wait for it.
  const saved = cleanSlide({ ...mixed, cards: [...mixed.cards, { icon: "none", number: "$120", label: "Keyboard", highlight: false }] });
  assert.ok(saved.layout === "price_cards");
  assert.deepEqual(saved.cards.map((c) => c.icon), ["headphones", "none", "none"]);
  assert.doesNotMatch(html(saved), /aria-label="Headphones"/);
  const picked = cleanSlide({ ...saved, cards: saved.cards.map((c, i) => ({ ...c, icon: i === 0 ? c.icon : ("keyboard" as const) })) });
  assert.ok(picked.layout === "price_cards");
  assert.deepEqual(picked.cards.map((c) => c.icon), ["headphones", "keyboard", "keyboard"]);
  assert.match(html(picked), /aria-label="Headphones"/);
  assert.equal(limitNotes(picked).filter((n) => n.field === "icons").length, 0);
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

// Widths of these lines in the 176px statement type, measured in Chromium with the bundled font
// (2026-11-14). Each is 19 characters or fewer, and each but the last is too wide for the TV.
const MEASURED: [string, number][] = [
  ["Mortgage protection", 1705],
  ["Medicare supplement", 1772],
  ["Women make up most", 1796],
  ["Make warm transfers", 1690],
  ["Welcome Moe to the", 1668],
  ["Call your leads back", 1592],
];

test("statement widths are measured, not counted: the estimate matches the real font and errs wide", () => {
  for (const [line, px] of MEASURED) {
    const est = statementWidth(line);
    assert.ok(est >= px - 2 && est <= px * 1.01, `${line}: ${est} for ${px}`);
  }
  assert.ok(statementWidth("Call your leads back") <= STATEMENT_MAX_WIDTH);
  assert.ok(MEASURED.slice(0, 5).every(([line]) => statementWidth(line) > STATEMENT_MAX_WIDTH));
  // The table lines up from its first glyph to its last (a space, W, an accented e, the euro sign).
  for (const [ch, adv] of [[" ", 180], ["W", 1032], ["é", 611], ["’", 386], ["€", 767]] as const) assert.equal(statementWidth(ch), (adv * 176) / 1000 - 6, ch);
  // Capitals and m/w are wide, i/l narrow: 14 m's are wider than 30 i's.
  assert.ok(statementWidth("m".repeat(14)) > statementWidth("i".repeat(30)));
  // A word wraps where the browser wraps it: between words, and after a hyphen.
  assert.deepEqual(statementFit("Stop over-explaining."), { lines: 2, tooWide: "" });
  assert.deepEqual(statementFit("Stop over-explaining the Social ask"), { lines: 3, tooWide: "" });
  assert.deepEqual(statementFit("Underwriting-requirements."), { lines: 2, tooWide: "" });
  assert.equal(statementFit("Supercalifragilisticexpialidocious.").tooWide, "Supercalifragilisticexpialidocious.");
});

test("the TV's limit notes measure statements by width: a 19-character line can still wrap", () => {
  const k = (statement: string) => limitNotes(key(statement)).filter((n) => n.field === "statement").map((n) => n.message);
  assert.deepEqual(k("Paid in cash.\nToday."), []);
  assert.deepEqual(k("Call your leads back\nwithin five minutes."), []);
  assert.deepEqual(k("Women make up most\nof our new clients."), ["Line 1 is too wide for the TV, so it wraps onto another line. Shorten it or move the line break."]);
  assert.equal(k("Mortgage protection\nworks when women.").length, 2);
  // One typed line may wrap onto two; a third is too many.
  assert.deepEqual(k("Ask for the referral every time."), []);
  assert.deepEqual(k("Ask for the referral every single time you write a policy."), ["It wraps onto more than 2 lines on the TV. Say it shorter."]);
  assert.deepEqual(k("One\nTwo\nThree"), ["Two lines at most."]);
  const n = (statement: string) => limitNotes(news(statement)).filter((x) => x.field === "statement").map((x) => x.message);
  assert.deepEqual(n("Everybody’s getting a raise."), []);
  assert.deepEqual(n("Everybody’s getting a raise starting the first of next month."), ["It wraps onto more than 2 lines on the TV. Say it shorter."]);
  // The sample deck's statements all fit.
  for (const s of SAMPLE_DECK) if (s.layout === "key_line" || s.layout === "big_news") assert.deepEqual(limitNotes(s), [], s.statement);
});

test("the fallback Key line fits the TV on two lines, cut at word breaks, the whole title and the summary in the notes", () => {
  const titles = [
    "Stop over-explaining the Social ask on every call",
    "Call your leads back within five minutes, every single time",
    "The order for writing a policy",
    "What the equipment costs",
    "Comp increase and the 90-day rule",
    "Are you logging your dials every single day?",
    "Outshine me",
    // Lines of 19 characters or fewer that are still too wide (the review's examples).
    "Mortgage protection works when women make the call",
    "Women make up most of our new clients",
    "Medicare supplement commission",
    "Mortgage protection leads are working",
    "Make warm transfers your main move",
    "Welcome Moe to the team this week",
    "Who writes the policy when Mark is out",
    "Underwriting-requirements are changing",
  ];
  for (const t of titles) {
    const s = fallbackSlide(card(t, "Mary Jones canceled after the bank step. Talk about it.", ["Ask again."]));
    assert.ok(s.layout === "key_line");
    const lines = s.statement.split("\n");
    assert.ok(lines.length <= 2 && lines.every((l) => statementWidth(l) <= STATEMENT_MAX_WIDTH), `${t}: ${JSON.stringify(s.statement)}`);
    assert.deepEqual(limitNotes(s), [], t);
    // His words, in order, whole: the statement is the start of the title.
    const said = s.statement.replace(/\n/g, " ").replace(/[.?]$/, "");
    assert.ok(t.replace(/-/g, "- ").startsWith(said.replace(/-\s?/g, "- ").replace(/[,]$/, "")), `${t}: ${said}`);
    // Nothing but his title goes on the TV: the summary (Command Center's words) stays in the notes.
    assert.equal(s.line, "", t);
    assert.match(s.notes, /Mary Jones canceled after the bank step\. Talk about it\. Ask again\.$/);
    const cut = said.length < t.replace(/[.?]$/, "").length;
    if (cut) {
      assert.ok(s.notes.startsWith(`You say: ${t}`), `${t}: the notes keep the title`);
      // A cut never ends on "the", "on", an amount without its unit, a word that wants its noun, or a clause just opened.
      assert.doesNotMatch(said, /\b(the|on|every|within|five|new|main|when|who)$/i);
      assert.doesNotMatch(said, /\bwhen \w+$/i);
    }
  }
  // The review's 4-line case: two lines now, and nothing under them.
  const m = fallbackSlide(card("Mortgage protection works when women make the call"));
  assert.ok(m.layout === "key_line" && m.statement === "Mortgage\nprotection works.");
  // A question cut short still asks.
  const q = fallbackSlide(card("Are you logging your dials every single day?"));
  assert.ok(q.layout === "key_line" && q.statement.endsWith("?"));
  // Short titles are whole, on even lines.
  const whole = fallbackSlide(card("Comp increase and the 90-day rule"));
  assert.ok(whole.layout === "key_line" && whole.statement === "Comp increase and\nthe 90-day rule.");
  // A word too wide alone breaks after its hyphen, as the browser would.
  const hy = fallbackSlide(card("Underwriting-requirements are changing"));
  assert.ok(hy.layout === "key_line" && hy.statement === "Underwriting-\nrequirements.");
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
  // Openers that ask or announce go whole; a whole phrase keeps its particle.
  assert.equal(fallbackSection("Make sure you log every dial"), "Log every dial");
  assert.equal(fallbackSection("There's a new bonus"), "New bonus");
  assert.equal(fallbackSection("It's time to step up"), "Step up");
  assert.equal(fallbackSection("Let's talk about the raise"), "Raise");
  assert.equal(fallbackSection("Remember to clock in"), "Clock in");
  assert.equal(fallbackSection("Please stop saying 'um'"), "Stop saying um");
  assert.equal(fallbackSection("We need to talk about leads"), "Leads");
  assert.equal(fallbackSection("Don’t forget to log your dials"), "Log your dials");
});

test("a thought whose section he cleared is named like a fallback draft, from his title or its slide", () => {
  const d = buildDeck(meeting(), [item("A", "", key("What the equipment costs.")), item("B", "Pay", key("B."))], null, "2026-11-14");
  assert.deepEqual(d.sections, ["Equipment costs", "Pay"]);
  assert.equal(d.slides[2].eyebrow, "1 · Equipment costs");
  const titled = buildDeck(meeting(), [{ ...item("A", "", key("Stop\nover-explaining.")), title: "Make sure you log every dial" }, item("B", "Pay", key("B."))], null, "2026-11-14");
  assert.deepEqual(titled.sections, ["Log every dial", "Pay"]);
  const none = buildDeck(meeting(), [item("A", " ", key("The.")), item("B", "Pay", key("B."))], null, "2026-11-14");
  assert.deepEqual(none.sections, ["Ideas", "Pay"]);
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
  assert.ok(asKey.layout === "key_line" && asKey.statement === "Ask for the referral\nevery time.");
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
