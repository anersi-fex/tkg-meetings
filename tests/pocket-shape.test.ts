import { test } from "node:test";
import assert from "node:assert/strict";
import { isPocketCard, plainSummary, readRecording, readRecordingList, transcriptToText } from "../src/lib/pocket-shape";

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
