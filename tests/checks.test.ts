import { test } from "node:test";
import assert from "node:assert/strict";
import type { ContentSlide } from "../src/lib/slides";
import { namesToCheck, numbersNotInCard, openItemOnRed, quotedLines } from "../src/lib/checks";

const card = (title: string, summary = "", points: string[] = [], people: string[] = []) => ({ title, summary, points, people, said_at: null, open: true });
const number = (n: string, lines: string[] = []): ContentSlide => ({ layout: "big_number", title: "The number", number: n, label: "", pill: "", lines, notes: "" });
const keyLine = (statement: string, line = ""): ContentSlide => ({ layout: "key_line", statement, coral: "", line, notes: "" });
const titled = (title: string, n = "5"): ContentSlide => ({ layout: "big_number", title, number: n, label: "", pill: "", lines: [], notes: "" });

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

test("millions written with M, and dates said as ordinal words", () => {
  // The 5-character number limit makes 2.5 million "$2.5M".
  assert.deepEqual(numbersNotInCard([number("$2.5M")], card("Goal", "Next year's goal is 2.5 million in premium.")), []);
  assert.deepEqual(numbersNotInCard([number("$1M")], card("Goal", "A million in premium.")), []);
  assert.deepEqual(numbersNotInCard([number("$1.5m")], card("Goal", "One point five: 1.5 million.")), []);
  assert.deepEqual(numbersNotInCard([number("$2.5M")], card("Goal", "1.5 million.")), ["2.5"]);
  // "30m" alone is minutes, not millions.
  assert.deepEqual(numbersNotInCard([keyLine("Calls of 30m.")], card("Calls", "Keep calls to 30 minutes.")), []);
  // "Dec 1" against "the first of December", and the rest of the month.
  assert.deepEqual(numbersNotInCard([number("Dec 1")], card("Start", "The new comp plan starts the first of December.")), []);
  assert.deepEqual(numbersNotInCard([number("Dec 1")], card("Start", "It starts December first.")), []);
  assert.deepEqual(numbersNotInCard([number("Dec 15")], card("Start", "The fifteenth of December.")), []);
  assert.deepEqual(numbersNotInCard([number("Dec 15")], card("Start", "On the 15th.")), []);
  assert.deepEqual(numbersNotInCard([number("Jan 21")], card("Start", "The twenty-first of January.")), []);
  assert.deepEqual(numbersNotInCard([number("Oct 31")], card("Start", "Halloween, the thirty first.")), []);
  // An ordinal is still its own number.
  assert.deepEqual(numbersNotInCard([number("Dec 2")], card("Start", "The first of December.")), ["2"]);
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

test("names he never said and on neither list wait for his check", () => {
  const names = { people: ["Moe Karim", "Alex Alekseyev"], carriers: ["AHL", "AmAm", "Americo", "Foresters", "Newbridge", "Royal", "UHL"] };
  // A name that is not in the card: in the middle, at the start of a line, in a title.
  assert.deepEqual(namesToCheck([keyLine("Great week,\nJoe.", "Joe closed five apps.")], card("Win", "Moe closed five apps."), names), ["Joe"]);
  assert.deepEqual(namesToCheck([keyLine("Joe closed\nfive apps.")], card("Win", "Moe closed five apps this week."), names), ["Joe"]);
  assert.deepEqual(namesToCheck([number("5", ["Closed **five** apps."]), titled("Joe’s big week")], card("Win", "Moe closed five apps."), names), ["Joe"]);
  assert.deepEqual(namesToCheck([keyLine("Big news.", "Shoutout. Joe closed five.")], card("Win", "Moe closed five."), names), ["Joe"]);
  // Teammates from the team list, the card's people, carriers and Mark pass.
  assert.deepEqual(namesToCheck([keyLine("Great week.", "Moe and Alex closed with AmAm, then Mark.")], card("Win", "Moe and Alex closed."), names), []);
  assert.deepEqual(namesToCheck([keyLine("Great week.", "Shoutout to Dana today.")], card("Win", "Dana closed.", [], ["Dana"]), names), []);
  assert.deepEqual(namesToCheck([keyLine("Go with Royal.", "Then American Amicable, then Foresters.")], card("Order", ""), names), []);
  // A name he said still waits for his check (a client's name must never reach the TV unseen);
  // a word the card also writes in lower case is an ordinary word.
  assert.deepEqual(namesToCheck([keyLine("Joe closed\nfive apps.")], card("Win", "Joe closed five apps this week."), names), ["Joe"]);
  assert.deepEqual(namesToCheck([keyLine("Mary Jones\nsaid yes.")], card("Win", "Mary Jones said yes on the first call."), names), ["Mary", "Jones"]);
  assert.deepEqual(namesToCheck([keyLine("Draft on the 3rd.", "Drafts go out on the 3rd.")], card("Draft date", "the drafts go out on the 3rd."), names), []);
  // Not names: an everyday word at the start, "the Social", a day, a shorthand in capitals, his own name.
  const s = keyLine("Stop. Everybody’s\non the phones.", "Before the Social on Monday, MIB is on Anersi.");
  assert.deepEqual(namesToCheck([s], card("Phones", "Everybody on the phones before the social."), names), []);
  assert.deepEqual(namesToCheck([keyLine("Dial more.", "Sell Final Expense on Mondays, licensed in Ohio and New York.")], card("Dial", ""), names), []);
  assert.deepEqual(namesToCheck([number("90", ["The 90-day Rule stays."])], card("Rule", "The 90-day rule."), names), []);
  assert.deepEqual(namesToCheck([titled("Callbacks first", "90")], card("Rule", "Call them back."), names), []);
  // Everyday names that are never a person.
  const words = (line: string) => namesToCheck([keyLine("Remember this.", line)], card("Tools", "Use the tools."), names);
  assert.deepEqual(words("Set it for the day after Social Security pays."), []);
  assert.deepEqual(words("Hi, this is Alex with The Koka Group."), []);
  assert.deepEqual(words("Upload every call into Sales Coach."), []);
  assert.deepEqual(words("Update every lead in InsuraCentral."), []);
  assert.deepEqual(words("Check Scorecard, Pocket and Command Center at TKG and Goosehead."), []);
  assert.deepEqual(words("Medicare and Medicaid, IMO, MIB, I and OK."), []);
  assert.deepEqual(words("From January to December, Monday to Friday, in Michigan and North Carolina."), []);
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
