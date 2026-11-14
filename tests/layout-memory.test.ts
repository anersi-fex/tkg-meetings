import { test } from "node:test";
import assert from "node:assert/strict";
import { keepOf, pickLayout, typedNotes } from "../src/lib/layout-memory";
import { cleanSlide, type ContentLayout, type ContentSlide } from "../src/lib/slides";

const bigNumber = cleanSlide({
  layout: "big_number",
  title: "Ninety days",
  number: "90",
  label: "working days",
  pill: "[X]% raise on commission · TBD",
  lines: ["**Logged in** and in the seat.", "Dialing **every** day.", "Notes in by **five**."],
  notes: "You say: ninety working days, then we talk raises.",
});

/** Picks layouts one after another, the way the editor does, without typing. */
function walk(start: ContentSlide, path: ContentLayout[]) {
  let slide = start;
  let kept = keepOf(start);
  for (const to of path) ({ next: slide, kept } = pickLayout(slide, kept, to));
  return { slide, kept };
}

test("a layout he goes back to comes back exactly as he left it", () => {
  for (const via of ["key_line", "chart", "price_cards", "script", "big_news"] as const) {
    const { slide } = walk(bigNumber, [via, "big_number"]);
    assert.deepEqual(slide, bigNumber, `through ${via}`);
  }
  // Several hops, Chart among them.
  assert.deepEqual(walk(bigNumber, ["chart", "key_line", "price_cards", "big_number"]).slide, bigNumber);
});

test("notes a layout added never follow him to another layout", () => {
  // As if the Price cards version had put what didn't fit it into its notes.
  let kept = keepOf(bigNumber);
  let slide: ContentSlide;
  ({ next: slide, kept } = pickLayout(bigNumber, kept, "price_cards"));
  slide = { ...slide, notes: `${slide.notes} Lines that didn't fit: Dialing every day.` };
  ({ next: slide, kept } = pickLayout(slide, kept, "key_line"));
  assert.equal(slide.notes, bigNumber.notes);
  ({ next: slide, kept } = pickLayout(slide, kept, "big_number"));
  assert.equal(slide.notes, bigNumber.notes);
  // A drawn chart's line from an earlier version never comes back either.
  assert.doesNotMatch(walk(bigNumber, ["chart", "key_line", "big_number"]).slide.notes, /slices are a drawing/i);
});

test("what he types in the notes comes along to every layout", () => {
  let { slide, kept } = walk(bigNumber, ["key_line"]);
  const typed = "You say: ninety days, and I mean it.";
  kept = typedNotes(kept, typed);
  slide = { ...slide, notes: typed };
  ({ next: slide, kept } = pickLayout(slide, kept, "big_number"));
  // Big number comes back with its own number, pill and bold, and the notes he just typed.
  assert.deepEqual(slide, { ...bigNumber, notes: typed });
  ({ next: slide, kept } = pickLayout(slide, kept, "chart"));
  assert.match(slide.notes, /and I mean it/);
  // Back on Key line, where he typed: no typing since he left it, so it is as he left it.
  ({ next: slide } = pickLayout(slide, kept, "key_line"));
  assert.equal(slide.notes, typed);
});
