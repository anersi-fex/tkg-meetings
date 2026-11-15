import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanToday, clock, DEFAULT_TODAY, detroitNow, oneThing } from "../src/lib/today-plan";

const s = DEFAULT_TODAY; // 100 a day, 10–12 and 1–4
const at = (weekday: number, h: number, m = 0) => ({ weekday, minute: h * 60 + m });

test("in a dial block on a weekday: dial now, with what's left", () => {
  const t = oneThing(s, at(2, 10, 30), 37);
  assert.equal(t.kind, "dial");
  assert.equal(t.title, "Dial now");
  assert.equal(t.line, "63 connections to go · until 12 PM");
});

test("between blocks: the next one; after the last: off; goal met: done", () => {
  assert.equal(oneThing(s, at(2, 12, 15), 50).title, "Next dial block 1 PM");
  assert.equal(oneThing(s, at(2, 8, 0), 0).kind, "next");
  assert.equal(oneThing(s, at(2, 17, 0), 80).kind, "off");
  assert.equal(oneThing(s, at(2, 11, 0), 100).kind, "done");
  assert.equal(oneThing(s, at(2, 11, 0), 1).line, "99 connections to go · until 12 PM");
});

test("weekends are off; no numbers yet says the goal", () => {
  assert.equal(oneThing(s, at(6, 11), 0).kind, "off");
  assert.equal(oneThing(s, at(0, 11), null).title, "Weekend");
  assert.match(oneThing(s, at(3, 10, 5), null).line, /Goal: 100 connections/);
});

test("settings are checked: goal range, blocks in order, bad blocks dropped", () => {
  assert.deepEqual(cleanToday(null), DEFAULT_TODAY);
  assert.equal(cleanToday({ goal: 0, blocks: [] }).goal, 100);
  const c = cleanToday({ goal: 50, blocks: [{ start: "13:00", end: "16:00" }, { start: "12:00", end: "11:00" }, { start: "09:30", end: "10:00" }] });
  assert.equal(c.goal, 50);
  assert.deepEqual(c.blocks, [{ start: "09:30", end: "10:00" }, { start: "13:00", end: "16:00" }]);
  assert.deepEqual(cleanToday({ goal: 50, blocks: [] }).blocks, []);
});

test("clock and Detroit time", () => {
  assert.equal(clock("13:30"), "1:30 PM");
  assert.equal(clock("00:00"), "12 AM");
  assert.deepEqual(detroitNow(new Date("2026-11-17T15:30:00Z")), { weekday: 2, minute: 10 * 60 + 30, day: "2026-11-17" });
});
