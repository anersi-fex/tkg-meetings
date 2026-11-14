"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { cachePocket, decidePocket, ensureOpenMeeting, getMeeting, getOpenMeeting, insertItems, listItems, pocketRows, switchOffArrivals, TRANSCRIPT_MAX } from "@/lib/data";
import { fetchRecording, PocketError } from "@/lib/pocket";
import { newItem } from "@/lib/meeting";
import { draftPending } from "@/lib/draft";
import { cut, isPocketCard, isRecordingId, POCKET_PREFIX, recordingOfCard, sameMoment } from "@/lib/pocket-shape";
import { makeWholeMeeting as makeWhole } from "@/lib/whole";
import type { ActionResult } from "../actions";

/**
 * The Pocket screen's two buttons. "Make a meeting" reads the recording from Pocket once (its
 * summary and transcript) and adds it to the next meeting as a thought, which Claude drafts from
 * his own words. "Command Center" only records that he left it there: Command Center gets every
 * recording on its own.
 */

async function owner(): Promise<ActionResult | null> {
  try {
    await requireRole("owner");
    return null;
  } catch {
    return { ok: false, error: "Sign in again to do that." };
  }
}

export async function makeMeetingFromPocket(recordingId: string): Promise<ActionResult> {
  const startedAt = Date.now();
  const denied = await owner();
  if (denied) return denied;
  const id = String(recordingId ?? "");
  if (!isRecordingId(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const cardId = `${POCKET_PREFIX}${id}`;
    const first = await ensureOpenMeeting();
    const already = (await listItems(first.id)).find((i) => recordingOfCard(i.card_id) === id);
    if (already) {
      await decidePocket(id, "meeting", already.id);
      revalidatePath("/pocket");
      return { ok: true, message: "It's already in your next meeting." };
    }
    const rec = await fetchRecording(id);
    await cachePocket([{ recording_id: id, title: rec.title, summary: rec.summary, recorded_at: rec.recordedAt, duration_sec: rec.durationSec }]);
    const transcript = cut(rec.transcript, TRANSCRIPT_MAX);
    const summary = cut(rec.summary, 2000);
    if (!summary && !transcript) return { ok: false, error: "Pocket hasn't finished this recording yet. Try again in a minute." };
    const card = { title: cut(rec.title || "A Pocket recording", 200), summary, points: [], people: [], said_at: rec.recordedAt, open: true, ...(transcript ? { transcript } : {}) };

    // Read the meeting again now: reading Pocket takes seconds, and End may have landed meanwhile.
    let meeting = await getMeeting(first.id);
    if (!meeting || meeting.status === "done") meeting = await ensureOpenMeeting();
    const items = await listItems(meeting.id);
    if (items.some((i) => recordingOfCard(i.card_id) === id)) {
      await decidePocket(id, "meeting", items.find((i) => recordingOfCard(i.card_id) === id)!.id);
      revalidatePath("/pocket");
      return { ok: true, message: "It's already in your next meeting." };
    }
    // Command Center filed the same recording into its Team meeting folder: that thought is it.
    const twin = items.find((i) => !isPocketCard(i.card_id) && sameMoment(i.card.said_at, rec.recordedAt));
    if (twin) {
      await decidePocket(id, "meeting", twin.id);
      revalidatePath("/pocket");
      return { ok: true, message: `It's already in your next meeting: Command Center filed it as "${cut(twin.card.title || "a thought", 60)}".` };
    }
    const position = items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
    // Played already (live, or paused): it waits switched off, like any thought that arrives mid-show.
    const midShow = meeting.started_at != null;
    await insertItems([newItem(meeting.id, { id: cardId, card }, position, midShow)]);
    if (!midShow && (await getMeeting(meeting.id))?.started_at) await switchOffArrivals(meeting.id, [cardId]);
    const made = (await listItems(meeting.id)).find((i) => i.card_id === cardId) ?? null;
    await decidePocket(id, "meeting", made?.id ?? null);
    const target = meeting.id;
    after(() => draftPending(target, { startedAt }).then(() => undefined, () => undefined));
    revalidatePath("/pocket");
    revalidatePath("/");
    return { ok: true, message: midShow ? "Added to the meeting, switched off (the show already started)." : "Added to your next meeting. Claude is making its slides." };
  } catch (err) {
    if (err instanceof PocketError) return { ok: false, error: err.message };
    console.error("pocket_meeting_failed", err instanceof Error ? err.name : "error");
    return { ok: false, error: "That didn't work. Try again in a moment." };
  }
}

export async function leaveToCommandCenter(recordingId: string): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  const id = String(recordingId ?? "");
  if (!isRecordingId(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const kept = (await pocketRows([id])).get(id);
    if (!kept) await cachePocket([{ recording_id: id, title: "", summary: "", recorded_at: null, duration_sec: null }]);
    // Only a thought still in the next meeting holds it there; one from an ended meeting can go.
    if (kept?.decision === "meeting" && kept.item_id) {
      const open = await getOpenMeeting();
      if (open && (await listItems(open.id)).some((i) => i.id === kept.item_id)) return { ok: false, error: "It's in your next meeting: switch it off there." };
    }
    await decidePocket(id, "command_center");
    revalidatePath("/pocket");
    return { ok: true, message: "Left to Command Center." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

export async function undoPocket(recordingId: string): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  const id = String(recordingId ?? "");
  if (!isRecordingId(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const kept = (await pocketRows([id])).get(id);
    if (kept?.decision !== "command_center" && kept?.decision !== "skipped") return { ok: false, error: "Nothing to undo." };
    await decidePocket(id, null);
    revalidatePath("/pocket");
    return { ok: true, message: "Back on your list." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

/** A whole meeting from this one recording: Claude splits it into topics at the length he picked. */
export async function makeWholeMeeting(recordingId: string, length: string, ask: string): Promise<ActionResult> {
  const startedAt = Date.now();
  const denied = await owner();
  if (denied) return denied;
  try {
    const r = await makeWhole(String(recordingId ?? ""), String(length ?? ""), String(ask ?? ""), { startedAt });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/pocket");
    revalidatePath("/");
    return { ok: true, message: r.message };
  } catch (err) {
    console.error("whole_meeting_failed", err instanceof Error ? err.name : "error");
    return { ok: false, error: "That didn't work. Try again in a moment." };
  }
}

/** Skip: this recording goes nowhere (not a meeting, not Command Center). Undo brings it back. */
export async function skipPocket(recordingId: string): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  const id = String(recordingId ?? "");
  if (!isRecordingId(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const kept = (await pocketRows([id])).get(id);
    if (!kept) await cachePocket([{ recording_id: id, title: "", summary: "", recorded_at: null, duration_sec: null }]);
    if (kept?.decision === "meeting" && kept.item_id) {
      const open = await getOpenMeeting();
      if (open && (await listItems(open.id)).some((i) => i.id === kept.item_id)) return { ok: false, error: "It's in your next meeting: switch it off there." };
    }
    await decidePocket(id, "skipped");
    revalidatePath("/pocket");
    return { ok: true, message: "Skipped." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}
