import { test } from "node:test";
import assert from "node:assert/strict";
import { cut, fitPlan, isPocketCard, isRecordingId, plainSummary, readRecording, readRecordingList, recordingOfCard, sameMoment, transcriptToText, wholeCardId, whenLabel } from "../src/lib/pocket-shape";

test("a Pocket summary in Markdown reads as plain text", () => {
  const md = "## Summary\n- Book **two** callbacks before 5 PM.\n- See [the list](https://example.com).\n1. Mark checks at 4:30.";
  assert.equal(plainSummary(md), "Book two callbacks before 5 PM. See the list. Mark checks at 4:30.");
  assert.equal(plainSummary("# Key points\nA #hashtag stays."), "A #hashtag stays.");
});

test("transcripts come as a string, segments or an object", () => {
  assert.equal(transcriptToText("  Hello there. "), "Hello there.");
  assert.equal(transcriptToText([{ text: "One." }, { content: "Two." }, { speaker: "x" }]), "One. Two.");
  assert.equal(transcriptToText({ segments: [{ text: "A." }, { text: "B." }] }), "A. B.");
  assert.equal(transcriptToText({ text: "Plain." }), "Plain.");
  assert.equal(transcriptToText(null), "");
});

test("one recording: wrapped in data, summary from summarizations, seconds kept", () => {
  const rec = readRecording({
    data: {
      recording: { id: "rec-1", title: "Closing on Fridays", createdAt: "2026-11-14T00:47:00Z", duration: 184 },
      transcript: { segments: [{ text: "Book your callbacks." }] },
      summarizations: { s1: { v2: { summary: { markdown: "- Two **callbacks** each." } } } },
    },
  });
  assert.deepEqual(rec, { id: "rec-1", title: "Closing on Fridays", recordedAt: "2026-11-14T00:47:00.000Z", durationSec: 184, summary: "Two callbacks each.", transcript: "Book your callbacks." });
});

test("one recording: bullet points, milliseconds, a bad date, no id", () => {
  const rec = readRecording({ id: "rec-2", duration: 90_000, recordedAt: "not a date", summarizations: [{ summary: { bulletPoints: ["One.", "Two."] } }] });
  assert.equal(rec?.durationSec, 90);
  assert.equal(rec?.recordedAt, null);
  assert.equal(rec?.summary, "One. Two.");
  assert.equal(rec?.title, "");
  assert.equal(readRecording({ data: { title: "no id" } }), null);
});

test("the list: data as a list, or under recordings or items; rows without an id are dropped", () => {
  assert.deepEqual(readRecordingList({ data: [{ id: "a" }, { title: "x" }] }).map((r) => r.id), ["a"]);
  assert.deepEqual(readRecordingList({ data: { recordings: [{ id: "b" }] } }).map((r) => r.id), ["b"]);
  assert.deepEqual(readRecordingList({ data: { items: [{ id: "c" }] } }).map((r) => r.id), ["c"]);
  assert.deepEqual(readRecordingList({ nothing: true }), []);
});

test("a Pocket thought's card id", () => {
  assert.ok(isPocketCard("pocket:rec-1"));
  assert.ok(!isPocketCard("9afde252-0000-0000-0000-000000000000"));
});

test("a new speaker starts a new line, so Claude can tell voices apart", () => {
  const t = transcriptToText([
    { speaker: "Speaker 1", text: "Book two callbacks." },
    { speaker: "Speaker 1", text: "Before five." },
    { speaker: "Speaker 2", text: "Got it." },
  ]);
  assert.equal(t, "Speaker 1: Book two callbacks. Before five.\nSpeaker 2: Got it.");
});

test("cut never ends inside an emoji", () => {
  assert.equal(cut("ab😀cd", 3), "ab");
  assert.equal(cut("ab😀cd", 4), "ab😀");
  assert.equal(cut("short", 10), "short");
});

test("recording ids: letters, digits and . _ : -, not a bare dot path", () => {
  assert.ok(isRecordingId("rec-friday-close"));
  assert.ok(isRecordingId("3f2b9c1e-0000-4c4c-9a9a-1234567890ab"));
  for (const bad of [".", "..", "../x", "a/b", "", "x".repeat(71), "a b"]) assert.ok(!isRecordingId(bad), bad);
});

test("ids may come as numbers; a detail body without one uses the id asked for", () => {
  assert.equal(readRecording({ id: 42, title: "x" })?.id, "42");
  assert.equal(readRecording({ data: { title: "x", summary: "y" } }, "rec-9")?.id, "rec-9");
  assert.deepEqual(readRecordingList({ data: [{ id: 7 }, { id: 8 }] }).map((r) => r.id), ["7", "8"]);
});

test("the recording time is read in Command Center's order (createdAt first)", () => {
  assert.equal(readRecording({ id: "a", createdAt: "2026-11-14T01:00:00Z", recordedAt: "2026-11-14T00:00:00Z" })?.recordedAt, "2026-11-14T01:00:00.000Z");
});

test("same moment: within two minutes", () => {
  assert.ok(sameMoment("2026-11-14T01:00:00Z", "2026-11-14T01:01:59Z"));
  assert.ok(!sameMoment("2026-11-14T01:00:00Z", "2026-11-14T01:02:01Z"));
  assert.ok(!sameMoment(null, "2026-11-14T01:00:00Z"));
});

test("when: today, yesterday, a weekday within the week, else the date (Detroit)", () => {
  const now = new Date("2026-11-14T20:00:00Z"); // Sat 3 PM in Detroit
  assert.equal(whenLabel("2026-11-14T19:14:00Z", 184, now), "Today 2:14 PM · 3 min");
  assert.equal(whenLabel("2026-11-14T03:30:00Z", 30, now), "Yesterday 10:30 PM · under 1 min");
  assert.equal(whenLabel("2026-11-11T15:00:00Z", null, now), "Wed 10:00 AM");
  assert.equal(whenLabel("2026-11-07T15:00:00Z", null, now), "Nov 7 10:00 AM");
});

test("a whole meeting's card ids name their recording", () => {
  assert.equal(wholeCardId("rec-1", 2), "pocket:rec-1#2");
  assert.equal(recordingOfCard("pocket:rec-1#2"), "rec-1");
  assert.equal(recordingOfCard("pocket:rec-1"), "rec-1");
  assert.equal(recordingOfCard("9afde252-0000"), null);
});

test("a plan is held to its length", () => {
  const p = (title: string, slides: number, points = 1) => ({ title, summary: "", points: Array.from({ length: points }, (_, i) => `p${i}`), slides });
  const total = (parts: { slides: number }[]) => parts.reduce((n, x) => n + x.slides, 0);
  // Brief: at most 3 parts, 3 to 4 slides.
  const brief = fitPlan([p("A", 3), p("B", 3), p("C", 1), p("D", 1)], "brief");
  assert.equal(brief.length, 3);
  assert.ok(total(brief) >= 3 && total(brief) <= 4, `brief ${total(brief)}`);
  // Full: 10 to 14 slides, 2 or 3 a part, the parts with more to say get more.
  const full = fitPlan([p("A", 1, 6), p("B", 1, 1), p("C", 1, 1), p("D", 1, 1)], "full");
  assert.ok(total(full) >= 10 && total(full) <= 14, `full ${total(full)}`);
  assert.equal(full[0].slides, 3);
  // Standard: never more than 5 parts or 8 slides; parts without a title are dropped.
  const std = fitPlan([p("A", 2), p("B", 2), p("", 2), p("C", 2), p("D", 2), p("E", 2), p("F", 2)], "standard");
  assert.equal(std.length, 5);
  assert.ok(total(std) <= 8 && total(std) >= 6, `standard ${total(std)}`);
  assert.deepEqual(fitPlan([], "standard"), []);
});
