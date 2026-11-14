import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentSlide } from "../src/lib/slides";
import { namesToCheck, numbersNotInCard, openItemOnRed, quotedLines } from "../src/lib/checks";

const card = (title: string, summary = "", points: string[] = [], people: string[] = []) => ({ title, summary, points, people, said_at: null, open: true });
const number = (n: string, lines: string[] = []): ContentSlide => ({ layout: "big_number", title: "The number", number: n, label: "", pill: "", lines, notes: "" });
const keyLine = (statement: string, line = ""): ContentSlide => ({ layout: "key_line", statement, coral: "", line, notes: "" });

test("numbers compare by value, not as text inside a bigger number", () => {
  // Wrong size: each of these was missed when a slide number only had to appear inside the card.
  assert.deepEqual(numbersNotInCard([number("$500")], card("Bonus", "A $5,000 bonus.")), ["500"]);
  assert.deepEqual(numbersNotInCard([number("$60k")], card("Bonus", "A $6,000 bonus.")), ["60"]);
  assert.deepEqual(numbersNotInCard([number("$6k")], card("Bonus", "A $60,000 bonus.")), ["6"]);
  assert.deepEqual(numbersNotInCard([number("15")], card("Apps", "We want 150 apps.")), ["15"]);
  assert.deepEqual(numbersNotInCard([number("10%")], card("Apps", "100 apps this month.")), ["10"]);
  assert.deepEqual(numbersNotInCard([number("9")], card("Rule", "90 days.")), ["9"]);
  assert.deepEqual(numbersNotInCard([number("Dec 20")], card("Plan", "Goals for 2026.")), ["20"]);
  assert.deepEqual(numbersNotInCard([number("3")], card("Apps", "37 apps.")), ["3"]);
});

test("the same number written another way passes", () => {
  // The k form the prompt asks for.
  assert.deepEqual(numbersNotInCard([number("$1.5k")], card("Bonus", "A $1,500 bonus.")), []);
  assert.deepEqual(numbersNotInCard([number("$2.5k")], card("Bonus", "$2500 each.")), []);
  assert.deepEqual(numbersNotInCard([number("$60k")], card("Bonus", "The pool is $60,000.")), []);
  assert.deepEqual(numbersNotInCard([number("$60,000")], card("Bonus", "The pool is 60k.")), []);
  assert.deepEqual(numbersNotInCard([number("$60k")], card("Bonus", "Sixty thousand? No: 60 thousand.")), []);
  // Said in words.
  assert.deepEqual(numbersNotInCard([number("90")], card("Rule", "Ninety working days.")), []);
  assert.deepEqual(numbersNotInCard([number("25")], card("Rule", "Twenty-five calls a day.")), []);
  assert.deepEqual(numbersNotInCard([number("100")], card("Goal", "A hundred apps.")), []);
  assert.deepEqual(numbersNotInCard([number("90")], card("Rule", "90 working days logged in.")), []);
  // A date: "Dec 1" against "December 1st".
  assert.deepEqual(numbersNotInCard([number("Dec 1")], card("Start", "It starts December 1st.")), []);
  // "5 kids" is five, not five thousand.
  assert.deepEqual(numbersNotInCard([keyLine("Five kids\nat home.", "All 5 kids.")], card("Family", "He has 5 kids.")), []);
});

test("only the words the room sees are checked", () => {
  const c = card("Bonus pool", "The pool is $60,000 this quarter.", ["Top three split it."]);
  const ok: ContentSlide = { layout: "big_number", title: "Bonus pool", number: "$60k", label: "this quarter", pill: "", lines: ["Top **three** split it."], notes: "You say: 25% more than last time." };
  assert.deepEqual(numbersNotInCard([ok], c), []);
  const chart: ContentSlide = { layout: "chart", title: "Share of the pie", subtitle: "", slices: [{ share: 30, label: "", highlight: true }, { share: 70, label: "", highlight: false }], center: "You", math: [], note: "", pill: "", drawn: true, notes: "" };
  assert.deepEqual(numbersNotInCard([chart], c), []);
});

test("quoted lines: whole pairs first, then the length", () => {
  // A short straight quote before his real one no longer swallows it.
  assert.deepEqual(quotedLines(card("Callbacks", "", ['Stop saying "no" to callbacks', '"We win together or not at all."'])), ["We win together or not at all."]);
  assert.deepEqual(quotedLines(card("Callbacks", 'Stop saying "no" to callbacks. "We win together or not at all."')), ["We win together or not at all."]);
  // Curly, straight, a straight quote inside a curly one, and too short.
  assert.deepEqual(quotedLines(card("Outshine me", "", ["“I want you to outshine me.”", 'And "save this as James".', '"short"'])), ["I want you to outshine me.", "save this as James"]);
  assert.deepEqual(quotedLines(card("Say it", "“Tell them \"no\" and mean it today.”")), ["Tell them \"no\" and mean it today."]);
  // A quote never runs from one point into the next.
  assert.deepEqual(quotedLines(card("Odd", "", ['He said "maybe', 'then "We win together, all of us."'])), ["We win together, all of us."]);
});

test("names on neither list wait for his check", () => {
  const names = { people: ["Moe Karim", "Alex Alekseyev"], carriers: ["AHL", "AmAm", "Americo", "Foresters", "Newbridge", "Royal", "UHL"] };
  // A misheard teammate.
  assert.deepEqual(namesToCheck([keyLine("Great week,\nJoe.", "Joe closed five apps.")], card("Win", "Joe closed five apps."), names), ["Joe"]);
  // Teammates from the team list, the card's people, carriers and Mark pass.
  assert.deepEqual(namesToCheck([keyLine("Great week.", "Moe and Alex closed with AmAm, then Mark.")], card("Win", "Moe and Alex closed."), names), []);
  assert.deepEqual(namesToCheck([keyLine("Great week.", "Shoutout to Dana today.")], card("Win", "Dana closed.", [], ["Dana"]), names), []);
  assert.deepEqual(namesToCheck([keyLine("Go with Royal.", "Then American Amicable, then Foresters.")], card("Order", ""), names), []);
  // Not names: a sentence start, "the Social", a day, a shorthand in capitals, his own name.
  const s = keyLine("Stop. Everybody’s\non the phones.", "Before the Social on Monday, MIB is on Anersi.");
  assert.deepEqual(namesToCheck([s], card("Phones", "Everybody on the phones before the social."), names), []);
  assert.deepEqual(namesToCheck([keyLine("Dial more.", "Sell Final Expense on Mondays, licensed in Ohio and New York.")], card("Dial", ""), names), []);
  // A word the card uses in lower case ("rule") is a title in title case, not a name.
  assert.deepEqual(namesToCheck([number("90", ["The 90-day Rule stays."])], card("Rule", "The 90-day rule."), names), []);
  // A client's name in a script is flagged; the notes are never checked.
  const script: ContentSlide = { layout: "script", title: "Callbacks", subtitle: "", rows: [{ who: "rep", text: "Hi, is this Mary Jones?", aside: "" }], notes: "You say: Bob told me." };
  assert.deepEqual(namesToCheck([script], card("Callbacks", "Call them back."), names), ["Mary", "Jones"]);
  // A possessive is the name.
  assert.deepEqual(namesToCheck([keyLine("Big week.", "That was Sam’s best week.")], card("Win", "Big week."), names), ["Sam"]);
});

test("a red Big news never holds an open item", () => {
  assert.equal(openItemOnRed({ layout: "big_news", statement: "Everybody gets [X]% more.", line: "", notes: "" }), true);
  assert.equal(openItemOnRed({ layout: "big_news", statement: "A new bonus.", line: "The amount · TBD", notes: "" }), true);
  assert.equal(openItemOnRed({ layout: "big_news", statement: "Everybody’s getting a raise.", line: "Newer people after 90 working days.", notes: "Open: [X]" }), false);
  assert.equal(openItemOnRed(number("[X]")), false);
});
