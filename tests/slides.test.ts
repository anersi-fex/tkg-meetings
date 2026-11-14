import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_LAYOUTS, ContentSlideSchema, DRAWN_NOTE, cleanSlide, fallbackSlide, limitNotes, switchLayout, type ContentSlide } from "../src/lib/slides";
import { numbersNotInCard, parseConnector, quotedLines, DEFAULT_CC_URL } from "../src/lib/checks";

const card = (title: string, summary = "", points: string[] = []) => ({ title, summary, points, people: [], said_at: null, open: true });

test("cleanSlide refuses an unknown layout and caps every list", () => {
  assert.throws(() => cleanSlide({ layout: "cover" }));
  assert.throws(() => cleanSlide(null));
  const steps = cleanSlide({ layout: "step_chain", title: "Order", steps: Array.from({ length: 9 }, (_, i) => ({ name: `Step ${i}`, person: "boss", last_resort: true })) });
  assert.ok(steps.layout === "step_chain");
  assert.equal(steps.steps.length, 6);
  // An unknown person is "none"; only the last step can be the last resort.
  assert.equal(steps.steps[0].person, "none");
  assert.deepEqual(steps.steps.map((s) => s.last_resort), [false, false, false, false, false, true]);
  const cards = cleanSlide({ layout: "price_cards", cards: [{ number: "$1", highlight: true }, { number: "$2", highlight: true }, { number: "$3" }, { number: "$4" }, { number: "$5" }] });
  assert.ok(cards.layout === "price_cards" && cards.cards.length === 4 && cards.cards.filter((c) => c.highlight).length === 1);
});

test("cleanSlide keeps a key line to two lines (a third joins the second) and drops a coral word it does not hold", () => {
  const k = cleanSlide({ layout: "key_line", statement: "One\nTwo\nThree", coral: "Four" });
  assert.ok(k.layout === "key_line" && k.statement === "One\nTwo Three" && k.coral === "");
});

test("a chart always has two slices, exactly one highlight, and sizes that add up to 100", () => {
  const c = cleanSlide({ layout: "chart", slices: [{ share: 100, highlight: false }] });
  assert.ok(c.layout === "chart" && c.slices.length === 2 && c.slices.filter((s) => s.highlight).length === 1);
  assert.equal(c.slices.reduce((a, s) => a + s.share, 0), 100);
});

test("every layout switch gives a valid slide and keeps the speaker notes", () => {
  const start: ContentSlide = { layout: "big_number", title: "The 90-day rule", number: "90", label: "working days", pill: "", lines: ["Logged in.", "Not from hire date."], notes: "You say: ninety days." };
  for (const to of CONTENT_LAYOUTS) {
    const s = switchLayout(start, to);
    assert.equal(s.layout, to);
    assert.ok(ContentSlideSchema.safeParse(s).success, `${to} is not valid`);
    // A chart made up on the spot is a drawing, and its notes say so first.
    assert.equal(s.notes, to === "chart" ? `${DRAWN_NOTE} You say: ninety days.` : "You say: ninety days.");
  }
});

test("limit notes flag what the TV cannot fit", () => {
  assert.deepEqual(limitNotes({ layout: "big_news", statement: "Short.", line: "", notes: "" }), []);
  const long = limitNotes({ layout: "big_number", title: "x".repeat(40), number: "$60,000", label: "", pill: "", lines: [], notes: "" });
  assert.deepEqual(long.map((n) => n.field).sort(), ["number", "title"]);
});

test("the fallback is a Key line made of his own title, inside the guide's limits", () => {
  const s = fallbackSlide(card("Stop over-explaining the Social ask", "Just ask for it. Keep moving."));
  assert.ok(s.layout === "key_line");
  assert.equal(s.statement.split("\n").length, 2);
  assert.ok(s.statement.split("\n").every((l) => l.length <= 19));
  assert.ok(s.statement.endsWith("."));
  assert.equal(s.line, "Just ask for it.");
  // The title did not fit: the whole of it opens the notes.
  assert.match(s.notes, /^You say: Stop over-explaining the Social ask\. /);
  assert.deepEqual(limitNotes(s), []);
  assert.ok(ContentSlideSchema.safeParse(s).success);
});

test("numbers the card never said are caught; $60k and 60,000 count as said", () => {
  const c = card("Bonus pool", "The pool is $60,000 this quarter.", ["Top three split it."]);
  const ok: ContentSlide = { layout: "big_number", title: "Bonus pool", number: "$60k", label: "this quarter", pill: "", lines: ["Top **three** split it."], notes: "You say: 25% more than last time." };
  assert.deepEqual(numbersNotInCard([ok], c), []);
  const bad: ContentSlide = { layout: "big_number", title: "Bonus pool", number: "$75k", label: "", pill: "", lines: ["Up 25% on last time."], notes: "" };
  assert.deepEqual(numbersNotInCard([bad], c).sort(), ["25", "75"]);
  // A chart's drawn slice sizes are not words on the slide.
  const chart: ContentSlide = { layout: "chart", title: "Share of the pie", subtitle: "", slices: [{ share: 30, label: "", highlight: true }, { share: 70, label: "", highlight: false }], center: "You", math: [], note: "", pill: "", drawn: true, notes: "" };
  assert.deepEqual(numbersNotInCard([chart], c), []);
});

test("quoted lines are what he said in quote marks", () => {
  assert.deepEqual(quotedLines(card("Outshine me", "", ["“I want you to outshine me.”", 'And "save this as James".', '"short"'])), ["I want you to outshine me.", "save this as James"]);
});

test("the connector address: the full link, a bare token, or nothing", () => {
  assert.deepEqual(parseConnector("https://cc.example.com/api/mcp?token=abcdefghijklmnop1234"), { url: "https://cc.example.com/api/mcp", token: "abcdefghijklmnop1234" });
  assert.deepEqual(parseConnector("  https://cc.example.com/?token=abcdefghijklmnop1234#x "), { url: "https://cc.example.com/api/mcp", token: "abcdefghijklmnop1234" });
  assert.deepEqual(parseConnector("abcdefghijklmnop1234"), { url: DEFAULT_CC_URL, token: "abcdefghijklmnop1234" });
  assert.equal(parseConnector("http://cc.example.com/api/mcp?token=abcdefghijklmnop1234"), null);
  assert.equal(parseConnector("https://cc.example.com/api/mcp?token=short"), null);
  assert.equal(parseConnector("not a token!"), null);
  assert.equal(parseConnector(""), null);
});
