import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck, coverLineFor, scoreboardSlide, type DeckItem, type DeckMeeting, type ScoreSnapshot } from "../src/lib/deck";
import { isRed, type ContentSlide } from "../src/lib/slides";
import { SAMPLE_DECK } from "../src/lib/sample-deck";

const meeting = (over: Partial<DeckMeeting> = {}): DeckMeeting => ({ title: "Team meeting", meetsOn: "2026-11-18", coverLine: "", scoreboard: true, quote: null, ...over });
const key = (statement: string): ContentSlide => ({ layout: "key_line", statement, coral: "", line: "", notes: "" });
const news = (statement: string): ContentSlide => ({ layout: "big_news", statement, line: "", notes: "" });
const number = (title: string): ContentSlide => ({ layout: "big_number", title, number: "90", label: "", pill: "", lines: [], notes: "" });
const item = (id: string, section: string, ...slides: ContentSlide[]): DeckItem => ({ id, section, slides });
const score: ScoreSnapshot = { monthKey: "2026-11", totalCents: 5_180_000, goalCents: 15_000_000, policies: 4, final: false, daysLeft: "9 business days left", readOn: "2026-11-14" };

test("deck order: cover, scoreboard, agenda, sections in order, Housekeeping last, quote", () => {
  const d = buildDeck(
    meeting({ quote: { text: "I want you to outshine me.", name: "" } }),
    [item("a", "Housekeeping", key("Clean desks.")), item("b", "Your raise", number("The 90-day rule")), item("c", "Bonuses", key("Share of the pie."))],
    score,
    "2026-11-14",
  );
  assert.deepEqual(
    d.slides.map((s) => s.layout),
    ["cover", "scoreboard", "agenda", "big_number", "key_line", "key_line", "quote"],
  );
  assert.deepEqual(d.sections, ["Your raise", "Bonuses", "Housekeeping"]);
  assert.deepEqual(d.itemOfSlide, [null, null, null, "b", "c", "a", null]);
  assert.equal(d.slides[3].eyebrow, "1 · Your raise");
  assert.equal(d.slides[5].eyebrow, "3 · Housekeeping");
  assert.equal(d.slides[0].eyebrow, "The Koka Group · November 2026");
  const last = d.slides.at(-1)!;
  assert.ok(last.layout === "quote" && last.name === "Anersi Koka");
  // Every slide knows its place for the footer.
  assert.deepEqual(d.slides.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(d.slides.every((s) => s.total === 7));
});

test("no agenda with one section; no scoreboard when off or when Scorecard did not answer", () => {
  const items = [item("a", "Your raise", number("The 90-day rule"))];
  assert.deepEqual(buildDeck(meeting(), items, null, "2026-11-14").slides.map((s) => s.layout), ["cover", "big_number"]);
  assert.deepEqual(buildDeck(meeting({ scoreboard: false }), items, score, "2026-11-14").slides.map((s) => s.layout), ["cover", "big_number"]);
});

test("Big news opens its section; the rest keep the owner's order", () => {
  const d = buildDeck(meeting({ scoreboard: false }), [item("a", "Pay", key("First."), number("Then")), item("b", "Pay", news("Raises for all."), key("Last.")), item("c", "Other", key("Other."))], null, "2026-11-14");
  assert.deepEqual(d.slides.map((s) => s.layout), ["cover", "agenda", "big_news", "key_line", "big_number", "key_line", "key_line"]);
});

test("six sections fold into five with Housekeeping, and say so", () => {
  const items = ["One", "Two", "Three", "Four", "Five", "Six"].map((s, i) => item(String(i), s, key(`${s}.`)));
  const d = buildDeck(meeting({ scoreboard: false }), items, null, "2026-11-14");
  assert.deepEqual(d.sections, ["One", "Two", "Three", "Four", "Housekeeping"]);
  const agenda = d.slides.find((s) => s.layout === "agenda");
  assert.ok(agenda && agenda.layout === "agenda" && agenda.rows.length === 5 && agenda.title === "Five things");
  assert.match(d.warnings.join(" "), /6 topics/);
  // Nothing is lost: all six thoughts are still in the deck.
  assert.equal(d.itemOfSlide.filter(Boolean).length, 6);
});

test("red slides never sit two in a row and stay a third of the deck at most", () => {
  const items = [item("a", "One", news("A.")), item("b", "One", news("B.")), item("c", "Two", news("C.")), item("d", "Three", key("D.")), item("e", "Three", news("E."))];
  const d = buildDeck(meeting({ scoreboard: false, quote: { text: "Close.", name: "" } }), items, null, "2026-11-14");
  for (let i = 1; i < d.slides.length; i++) assert.ok(!(isRed(d.slides[i - 1]) && isRed(d.slides[i])), `slides ${i} and ${i + 1} are both red`);
  assert.ok(d.slides.filter(isRed).length * 3 <= d.slides.length);
  assert.equal(d.slides[0].layout, "cover");
  assert.equal(d.slides.at(-1)!.layout, "quote");
  // A demoted Big news keeps its words.
  assert.ok(d.slides.some((s) => s.layout === "key_line" && s.statement === "B."));
});

test("a single Big news right after the cover becomes a Key line", () => {
  const d = buildDeck(meeting({ scoreboard: false }), [item("a", "Pay", news("Raises for all."))], null, "2026-11-14");
  assert.deepEqual(d.slides.map((s) => s.layout), ["cover", "key_line"]);
});

test("cover line from the sections, short or summed up", () => {
  assert.equal(coverLineFor(["Your raise", "Bonuses", "Who writes the policy"]), "Your raise, bonuses, and who writes the policy.");
  assert.equal(coverLineFor(["Your raise", "MIB checks"]), "Your raise and MIB checks.");
  assert.equal(coverLineFor(["Your raise and the 90-day rule", "Bonuses by share of the pie", "Equipment"]), "Three things for the team today.");
  assert.equal(coverLineFor([]), "");
});

test("scoreboard slide: so far, final, and goal hit", () => {
  const so = scoreboardSlide(score);
  assert.ok(so.layout === "scoreboard");
  assert.equal(so.title, "November so far");
  assert.equal(so.number, "$51,800");
  assert.equal(so.line, "of the $150,000 goal · 4 policies");
  assert.equal(so.pill, "35% · 9 business days left");
  const fin = scoreboardSlide({ ...score, final: true });
  assert.ok(fin.layout === "scoreboard" && fin.title === "November final" && fin.pill === "35% of goal");
  const hit = scoreboardSlide({ ...score, totalCents: 16_000_000 });
  assert.ok(hit.layout === "scoreboard" && hit.title === "We hit the goal" && hit.pillTone === "green" && hit.pct === 100);
  const noGoal = scoreboardSlide({ ...score, goalCents: 0, policies: 1 });
  assert.ok(noGoal.layout === "scoreboard" && noGoal.line === "1 policy" && noGoal.pill === "" && noGoal.pct === null);
});

test("the sample deck holds all 12 approved layouts", () => {
  assert.equal(new Set(SAMPLE_DECK.map((s) => s.layout)).size, 12);
});
