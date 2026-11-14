import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { ContentSlide } from "../src/lib/slides";
import type { Item, Meeting } from "../src/lib/types";

// The modules under test are server only ("server-only" throws outside the server); the pure
// helpers in them are loaded here with that marker turned into an empty module.
// (module.registerHooks is in Node 22.15 and later; this project's Node types are older.)
type Resolve = (specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void };
const empty = pathToFileURL(path.join(process.cwd(), "node_modules/server-only/empty.js")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: empty, shortCircuit: true, format: "commonjs" };
    return next(specifier, context);
  },
});
const load = async () => ({
  meeting: await import("../src/lib/meeting"),
  data: await import("../src/lib/data"),
  auth: await import("../src/lib/auth"),
});

const keyLine = (statement: string): ContentSlide => ({ layout: "key_line", statement, coral: "", line: "", notes: "" });
const card = (title: string, summary = "") => ({ title, summary, points: [], people: [], said_at: null, open: true });
const teamCard = (id: string, title: string, summary = "") => ({ id, card: card(title, summary) });

function earlier(over: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    meeting_id: "m-1",
    card_id: "c-1",
    card: card("Bonus pool"),
    included: true,
    position: 1,
    section: "Bonuses",
    slides: [keyLine("Bonus pool")],
    quote_candidates: [],
    draft_status: "ready",
    draft_note: null,
    done_in_cc: false,
    off_by_app: false,
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:00:00.000Z",
    ...over,
  };
}

test("a new thought comes in on before Play, and off (by the app) once the show started", async () => {
  const { meeting } = await load();
  const before = meeting.newItem("m-2", teamCard("c-9", "New hire"), 4, false);
  assert.equal(before.included, true);
  assert.equal(before.off_by_app, false);
  assert.equal(before.draft_status, "pending");
  const during = meeting.newItem("m-2", teamCard("c-9", "New hire"), 4, true);
  assert.equal(during.included, false);
  assert.equal(during.off_by_app, true);
  // The note is not stored: it is shown from the flag (see shownNote), so a draft never wipes it.
  assert.equal(during.draft_note, null);
});

test("a thought the app switched off mid-show comes back on at the next meeting", async () => {
  const { meeting } = await load();
  // Came in during meeting 1's show, drafted there, never switched by him and never shown.
  const p = earlier({ included: false, off_by_app: true, draft_note: "Came in during the meeting: switch it on to show it. Check the numbers: 5 isn’t in what you said." });
  const next = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: p, shown: false });
  assert.equal(next.included, true);
  assert.equal(next.off_by_app, false);
  assert.equal(next.draft_status, "ready");
  assert.deepEqual(next.slides, p.slides);
  // Its own note stays; the came-in part does not follow it.
  assert.equal(next.draft_note, "Check the numbers: 5 isn’t in what you said.");
  // Arriving mid-show again: off again, by the app again.
  const again = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, true, { item: p, shown: false });
  assert.equal(again.included, false);
  assert.equal(again.off_by_app, true);
});

test("his own switch carries over; shown but not marked done stays off with a note", async () => {
  const { meeting } = await load();
  const off = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: earlier({ included: false }), shown: false });
  assert.equal(off.included, false);
  assert.equal(off.off_by_app, false);
  const on = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: earlier({ included: true }), shown: false });
  assert.equal(on.included, true);

  const shownNotDone = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: earlier(), shown: true });
  assert.equal(shownNotDone.included, false);
  assert.equal(shownNotDone.off_by_app, false);
  assert.equal(shownNotDone.draft_note, meeting.SHOWN_NOT_DONE);
  // Mid-show, a real reason to be off is kept as his kind of off: it does not come back on later.
  const shownNotDoneLive = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, true, { item: earlier(), shown: true });
  assert.equal(shownNotDoneLive.off_by_app, false);

  // Reopened in Command Center after a meeting marked it done: counts as new, so on.
  const reopened = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: earlier({ included: false, done_in_cc: true }), shown: true });
  assert.equal(reopened.included, true);
});

test("a changed card is drafted again unless he edited it", async () => {
  const { meeting } = await load();
  const changed = meeting.newItem("m-2", teamCard("c-1", "Bonus pool", "Now $6,000."), 1, false, { item: earlier({ draft_note: "Old check." }), shown: false });
  assert.equal(changed.draft_status, "pending");
  assert.equal(changed.draft_note, null);
  const edited = meeting.newItem("m-2", teamCard("c-1", "Bonus pool", "Now $6,000."), 1, false, { item: earlier({ draft_status: "edited" }), shown: false });
  assert.equal(edited.draft_status, "edited");
  assert.equal(edited.draft_note, meeting.EDITED_CHANGED);
  // Never drafted before: a fresh row (switched on before Play).
  const never = meeting.newItem("m-2", teamCard("c-1", "Bonus pool"), 1, false, { item: earlier({ slides: [], draft_status: "pending", included: false }), shown: false });
  assert.equal(never.included, true);
  assert.equal(never.draft_status, "pending");
});

test("the came-in note shows only while the app keeps the thought off, ahead of its own note", async () => {
  const { data } = await load();
  assert.equal(data.shownNote(null, true), data.CAME_IN_NOTE);
  assert.equal(data.shownNote("Check the names: Zed.", true), `${data.CAME_IN_NOTE} Check the names: Zed.`);
  assert.equal(data.shownNote("Check the names: Zed.", false), "Check the names: Zed.");
  // Never twice.
  assert.equal(data.shownNote(data.CAME_IN_NOTE, true), data.CAME_IN_NOTE);
  assert.equal(data.storedNote(`${data.CAME_IN_NOTE} Check the names: Zed.`), "Check the names: Zed.");
  assert.equal(data.storedNote(data.CAME_IN_NOTE), null);
  assert.equal(data.storedNote(""), null);
  assert.equal(data.storedNote("Saved."), "Saved.");
});

test("End marks only the thoughts the TV showed that have a card and are not marked yet", async () => {
  const { meeting } = await load();
  const m = { shown_items: ["a", "b", "c"] } as unknown as Meeting;
  const items = [earlier({ id: "a" }), earlier({ id: "b", done_in_cc: true }), earlier({ id: "c", card_id: "" }), earlier({ id: "d" })];
  assert.deepEqual(
    meeting.toMarkDone(m, items).map((i) => i.id),
    ["a"],
  );
});

test("sign-in tries count an IPv6 address by its /64 and an IPv4 address as it is", async () => {
  const { auth } = await load();
  assert.equal(auth.addressKey("203.0.113.7"), "203.0.113.7");
  assert.equal(auth.addressKey(" 203.0.113.7 "), "203.0.113.7");
  assert.equal(auth.addressKey("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(auth.addressKey("2001:db8:aa:bb:1:2:3:4"), "2001:db8:aa:bb::/64");
  // Every address of one /64 is one key, however it is written.
  assert.equal(auth.addressKey("2001:0DB8:00aa:00bb:ffff:ffff:ffff:ffff"), "2001:db8:aa:bb::/64");
  assert.equal(auth.addressKey("2001:db8:aa:bb::1"), "2001:db8:aa:bb::/64");
  assert.equal(auth.addressKey("[2001:db8:aa:bb::1]:443"), "2001:db8:aa:bb::/64");
  assert.equal(auth.addressKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(auth.addressKey("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(auth.addressKey("::1"), "0:0:0:0::/64");
  // Not an address: kept as given (cut to 64 characters).
  assert.equal(auth.addressKey("unknown"), "unknown");
  assert.equal(auth.addressKey(""), "unknown");
  assert.equal(auth.addressKey("1:2:3"), "1:2:3");
  assert.equal(auth.addressKey("x".repeat(80)).length, 64);
});

test("a deck rebuilt during the show keeps the same thought on screen", async () => {
  const { meeting } = await load();
  const s = (layout: string, itemId?: string) => ({ layout, itemId }) as never;
  const old = [s("cover"), s("agenda"), s("key_line", "a"), s("key_line", "b")];
  const next = [s("cover"), s("agenda"), s("key_line", "c"), s("key_line", "b"), s("key_line", "a")];
  assert.equal(meeting.mapSlide(old, 3, next), 3);
  assert.equal(meeting.mapSlide(old, 2, next), 4);
  // Switched off: the next slide that is still there.
  assert.equal(meeting.mapSlide(old, 2, [s("cover"), s("agenda"), s("key_line", "b")]), 2);
});
