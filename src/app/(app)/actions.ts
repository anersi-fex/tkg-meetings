"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { ensureOpenMeeting, getItem, getMeeting, getOpenMeeting, listItems, moveSlide, updateItem, updateMeeting } from "@/lib/data";
import { draftPending } from "@/lib/draft";
import { endMeeting, markShownDone, pauseShow, refreshLiveDeck, restartShow as restartOnTv, startShow, syncFromCommandCenter, toMarkDone } from "@/lib/meeting";
import { cleanSection } from "@/lib/deck";
import { cleanSlide, type ContentSlide } from "@/lib/slides";
import { isDateKey } from "@/lib/month";
import type { Meeting, ScoreboardMonth } from "@/lib/types";

/**
 * Every change the owner makes on his phone. Each one checks the owner's session first, takes
 * only plain values (never a whole row from the browser), and keeps the TV's copy fresh when the
 * show is live. Results are plain words for the toast.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ok = (message?: string): ActionResult => ({ ok: true, message });
const no = (error: string): ActionResult => ({ ok: false, error });

async function owner(): Promise<ActionResult | null> {
  try {
    await requireRole("owner");
    return null;
  } catch {
    return no("Sign in again to do that.");
  }
}

/** Runs one change for the owner: session first, plain words back, never a stack trace. */
async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  try {
    return await fn();
  } catch (err) {
    console.error("action_failed", err instanceof Error ? err.name : "error");
    return no("That didn't save. Try again in a moment.");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function openItem(id: string) {
  if (!UUID.test(id)) return null;
  const item = await getItem(id);
  if (!item) return null;
  const meeting = await getMeeting(item.meeting_id);
  if (!meeting || meeting.status === "done") return null;
  return { item, meeting };
}

function afterChange(meetingId: string) {
  revalidatePath("/");
  after(() => refreshLiveDeck(meetingId).catch(() => undefined));
}

// --- The list -------------------------------------------------------------------------------------

export async function refreshFromCommandCenter(): Promise<ActionResult> {
  return run(async () => {
    const meeting = await ensureOpenMeeting();
    const r = await syncFromCommandCenter(meeting);
    if (!r.ok) return no(r.message);
    after(() => draftPending(meeting.id).then(() => undefined, () => undefined));
    revalidatePath("/");
    return ok(r.added ? `${r.added} new ${r.added === 1 ? "thought" : "thoughts"} came in.` : "Up to date with Command Center.");
  });
}

export async function setIncluded(itemId: string, included: boolean): Promise<ActionResult> {
  return run(async () => {
    const found = await openItem(itemId);
    if (!found) return no("That thought isn't in the next meeting anymore.");
    await updateItem(itemId, { included: included === true });
    afterChange(found.meeting.id);
    return ok(included ? "In the show." : "Left out.");
  });
}

/** Moves a thought one place up or down. */
export async function moveItem(itemId: string, dir: "up" | "down"): Promise<ActionResult> {
  return run(async () => {
    const found = await openItem(itemId);
    if (!found) return no("That thought isn't in the next meeting anymore.");
    const items = await listItems(found.meeting.id);
    const at = items.findIndex((i) => i.id === itemId);
    const to = dir === "up" ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= items.length) return ok();
    const order = [...items];
    [order[at], order[to]] = [order[to], order[at]];
    await Promise.all(order.map((it, i) => (it.position === i + 1 ? null : updateItem(it.id, { position: i + 1 }))));
    afterChange(found.meeting.id);
    return ok();
  });
}

// --- One thought --------------------------------------------------------------------------------------

/** Saves the editor: the section and the slides (cleaned and capped here, whatever the form sent). */
export async function saveItem(itemId: string, input: { section: string; slides: unknown[] }): Promise<ActionResult> {
  return run(async () => {
    const found = await openItem(itemId);
    if (!found) return no("That thought isn't in the next meeting anymore.");
    const slides: ContentSlide[] = [];
    for (const s of Array.isArray(input?.slides) ? input.slides.slice(0, 2) : []) {
      try {
        slides.push(cleanSlide(s));
      } catch {
        return no("One slide had a layout this app doesn't know.");
      }
    }
    if (!slides.length) return no("A thought needs at least one slide.");
    await updateItem(itemId, { section: cleanSection(String(input?.section ?? "")), slides, draft_status: "edited", draft_note: null });
    afterChange(found.meeting.id);
    revalidatePath(`/item/${itemId}`);
    return ok("Saved.");
  });
}

/** Asks Claude for a fresh draft (replaces the slides). */
export async function redraftItem(itemId: string): Promise<ActionResult> {
  return run(async () => {
    const found = await openItem(itemId);
    if (!found) return no("That thought isn't in the next meeting anymore.");
    if (found.item.draft_status === "drafting") return ok("Already drafting.");
    await updateItem(itemId, { draft_status: "pending", draft_note: null });
    after(() => draftPending(found.meeting.id).then(() => refreshLiveDeck(found.meeting.id)).catch(() => undefined));
    revalidatePath("/");
    revalidatePath(`/item/${itemId}`);
    return ok("Drafting again. It takes about half a minute.");
  });
}

// --- The meeting ------------------------------------------------------------------------------------------

export async function setMeetingDate(date: string): Promise<ActionResult> {
  return run(async () => {
    const meeting = await ensureOpenMeeting();
    const value = date && isDateKey(date) ? date : null;
    await updateMeeting(meeting.id, { meets_on: value });
    afterChange(meeting.id);
    return ok(value ? "Date set." : "Date cleared.");
  });
}

export async function setScoreboard(on: boolean, month: ScoreboardMonth): Promise<ActionResult> {
  return run(async () => {
    const meeting = await ensureOpenMeeting();
    await updateMeeting(meeting.id, { scoreboard: on === true, scoreboard_month: (["auto", "this", "last"] as const).includes(month) ? month : "auto" });
    afterChange(meeting.id);
    return ok(on ? "Scorecard slide on." : "Scorecard slide off.");
  });
}

/** The closing quote: one of his own lines (from a thought's quote candidates), or none. */
export async function setQuote(itemId: string | null, index: number | null): Promise<ActionResult> {
  return run(async () => {
    const meeting = await ensureOpenMeeting();
    if (!itemId) {
      await updateMeeting(meeting.id, { quote: null });
      afterChange(meeting.id);
      return ok("No closing quote.");
    }
    const found = await openItem(itemId);
    if (!found || found.meeting.id !== meeting.id) return no("That thought isn't in the next meeting anymore.");
    const text = found.item.quote_candidates[Number(index)];
    if (!text) return no("That line isn't there anymore.");
    await updateMeeting(meeting.id, { quote: { text, name: "Anersi Koka" } });
    afterChange(meeting.id);
    return ok("Closing quote set.");
  });
}

export async function setCover(title: string, line: string): Promise<ActionResult> {
  return run(async () => {
    const meeting = await ensureOpenMeeting();
    const t = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Team meeting";
    await updateMeeting(meeting.id, { title: t, cover_line: String(line ?? "").replace(/\s+/g, " ").trim().slice(0, 120) });
    afterChange(meeting.id);
    return ok("Cover saved.");
  });
}

// --- The show ------------------------------------------------------------------------------------------------

const ENDED = "That meeting already ended.";

/** Before a meeting goes on the TV: something to show, and nothing still drafting. Null when ready. */
async function notReady(meeting: Meeting): Promise<string | null> {
  if (meeting.status === "live") return null;
  const items = await listItems(meeting.id);
  if (!items.some((i) => i.included && i.slides.length)) return "Switch on at least one thought first.";
  if (items.some((i) => i.included && (i.draft_status === "pending" || i.draft_status === "drafting"))) return "A thought is still drafting. Give it a few seconds.";
  return null;
}

/**
 * Play: a meeting never played starts at the cover; a paused one comes back on the thought it
 * stopped on; a live one (a stale screen) only gets its deck refreshed, the slide stays.
 */
export async function playOnTv(): Promise<ActionResult> {
  return run(async () => {
    const meeting = await getOpenMeeting();
    if (!meeting) return no(ENDED);
    const why = await notReady(meeting);
    if (why) return no(why);
    const r = await startShow(meeting.id);
    if (!r) return no("The show didn't start. Try again.");
    revalidatePath("/");
    if (r.was === "live") return ok("Already on the TV.");
    return ok(r.was === "paused" && r.slide > 0 ? `Back on the TV at slide ${r.slide + 1}.` : "On the TV.");
  });
}

/** Start from the cover: the open meeting goes on the TV at slide 1 (live, paused or new). */
export async function restartShow(): Promise<ActionResult> {
  return run(async () => {
    const meeting = await getOpenMeeting();
    if (!meeting) return no(ENDED);
    const why = await notReady(meeting);
    if (why) return no(why);
    const r = await restartOnTv(meeting.id);
    if (!r) return no("The show didn't start. Try again.");
    revalidatePath("/");
    return ok("On the TV from the cover.");
  });
}

export async function moveShow(move: { delta?: number; to?: number }): Promise<ActionResult> {
  return run(async () => {
    const meeting = await getOpenMeeting();
    if (!meeting || meeting.status !== "live") return no("Nothing is on the TV.");
    const delta = move?.delta === 1 || move?.delta === -1 ? move.delta : 0;
    const to = Number.isInteger(move?.to) && (move.to as number) >= 0 ? (move.to as number) : undefined;
    const at = await moveSlide(meeting.id, to != null ? { to } : { delta });
    return at == null ? no("Nothing is on the TV.") : ok();
  });
}

/** Pause: the TV goes back to waiting; Play picks up on the same slide. */
export async function stopShow(): Promise<ActionResult> {
  return run(async () => {
    const meeting = await getOpenMeeting();
    if (!meeting || meeting.status !== "live") return no("Nothing is on the TV.");
    const paused = await pauseShow(meeting.id);
    revalidatePath("/");
    if (!paused) return no("Nothing is on the TV.");
    return ok(`Paused at slide ${paused.current_slide + 1}. Play picks up there.`);
  });
}

/** The open meeting, when it is still the one the screen showed (`meetingId`, when it sent one). */
async function meetingToEnd(meetingId: unknown): Promise<Meeting | null> {
  const meeting = await getOpenMeeting();
  if (!meeting) return null;
  if (typeof meetingId === "string" && meetingId && meetingId !== meeting.id) return null;
  return meeting;
}

/**
 * What End meeting will do, for its sheet: the titles of the thoughts it marks done in Command
 * Center (the ones the TV landed on, not marked yet) and whether the meeting went on the TV at all.
 */
export async function endPreview(meetingId?: string): Promise<{ ok: true; titles: string[]; shown: boolean } | { ok: false; error: string }> {
  const denied = await owner();
  if (denied && !denied.ok) return denied;
  try {
    const meeting = await meetingToEnd(meetingId);
    if (!meeting) return { ok: false, error: ENDED };
    const titles = toMarkDone(meeting, await listItems(meeting.id)).map((i) => i.card.title || "A thought");
    return { ok: true, titles, shown: meeting.started_at != null };
  } catch (err) {
    console.error("action_failed", err instanceof Error ? err.name : "error");
    return { ok: false, error: "That didn't load. Try again in a moment." };
  }
}

/**
 * Ends the open meeting, live, paused or never played (it never makes a new one): it moves to
 * Past and the thoughts the TV landed on are marked done in Command Center.
 */
export async function finishMeeting(meetingId?: string): Promise<ActionResult> {
  return run(async () => {
    const meeting = await meetingToEnd(meetingId);
    if (!meeting) return no(ENDED);
    const r = await endMeeting(meeting.id);
    revalidatePath("/");
    revalidatePath("/past");
    if (!r) return no(ENDED);
    if (r.failed) return ok(`Meeting saved. ${r.marked} marked done in Command Center; ${r.failed} didn't go through (${r.message ?? "try again from Past"}).`);
    return ok(r.marked ? `Meeting saved. ${r.marked} ${r.marked === 1 ? "thought" : "thoughts"} marked done in Command Center.` : "Meeting saved.");
  });
}

export async function retryMarkDone(meetingId: string): Promise<ActionResult> {
  return run(async () => {
    if (!UUID.test(meetingId)) return no("That meeting isn't there.");
    const m = await getMeeting(meetingId);
    if (!m || m.status !== "done") return no("That meeting isn't there.");
    const r = await markShownDone(m);
    revalidatePath(`/past/${meetingId}`);
    return r.failed ? no(r.message ?? "Command Center didn't answer.") : ok(r.marked ? `${r.marked} marked done in Command Center.` : "Nothing left to mark.");
  });
}
