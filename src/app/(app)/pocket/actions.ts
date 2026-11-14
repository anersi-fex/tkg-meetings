"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { cachePocket, decidePocket, ensureOpenMeeting, getMeeting, insertItems, listItems, pocketRows, TRANSCRIPT_MAX } from "@/lib/data";
import { fetchRecording, PocketError } from "@/lib/pocket";
import { newItem } from "@/lib/meeting";
import { draftPending } from "@/lib/draft";
import { POCKET_PREFIX } from "@/lib/pocket-shape";
import type { ActionResult } from "../actions";

/**
 * The Pocket screen's two buttons. "Make a meeting" reads the recording from Pocket once (its
 * summary and transcript) and adds it to the next meeting as a thought, which Claude drafts from
 * his own words. "Command Center" only records that he left it there: Command Center gets every
 * recording on its own.
 */

const RECORDING_ID = /^[A-Za-z0-9._:-]{1,120}$/;

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
  if (!RECORDING_ID.test(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const meeting = await ensureOpenMeeting();
    const cardId = `${POCKET_PREFIX}${id}`;
    const already = (await listItems(meeting.id)).find((i) => i.card_id === cardId);
    if (already) {
      await decidePocket(id, "meeting", already.id);
      revalidatePath("/pocket");
      return { ok: true, message: "It's already in your next meeting." };
    }
    const rec = await fetchRecording(id);
    await cachePocket([{ recording_id: id, title: rec.title, summary: rec.summary, recorded_at: rec.recordedAt, duration_sec: rec.durationSec }]);
    const kept = (await pocketRows([id])).get(id);
    const title = rec.title || kept?.title || "A Pocket recording";
    const card = {
      title: title.slice(0, 200),
      summary: (rec.summary || kept?.summary || "").slice(0, 2000),
      points: [],
      people: [],
      said_at: rec.recordedAt,
      open: true,
      ...(rec.transcript ? { transcript: rec.transcript.slice(0, TRANSCRIPT_MAX) } : {}),
    };
    if (!card.summary && !card.transcript) return { ok: false, error: "Pocket hasn't finished this recording yet. Try again in a minute." };
    const items = await listItems(meeting.id);
    const position = items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
    // Played already (live, or paused): it waits switched off, like any thought that arrives mid-show.
    const now = await getMeeting(meeting.id);
    await insertItems([newItem(meeting.id, { id: cardId, card }, position, now?.started_at != null)]);
    const made = (await listItems(meeting.id)).find((i) => i.card_id === cardId) ?? null;
    await decidePocket(id, "meeting", made?.id ?? null);
    after(() => draftPending(meeting.id, { startedAt }).then(() => undefined, () => undefined));
    revalidatePath("/pocket");
    revalidatePath("/");
    return { ok: true, message: "Added to your next meeting. Claude is making its slides." };
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
  if (!RECORDING_ID.test(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const kept = (await pocketRows([id])).get(id);
    if (!kept) await cachePocket([{ recording_id: id, title: "", summary: "", recorded_at: null, duration_sec: null }]);
    if (kept?.decision === "meeting") return { ok: false, error: "It's already in your next meeting: switch it off there." };
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
  if (!RECORDING_ID.test(id)) return { ok: false, error: "That recording isn't there." };
  try {
    const kept = (await pocketRows([id])).get(id);
    if (kept?.decision !== "command_center") return { ok: false, error: "Nothing to undo." };
    await decidePocket(id, null);
    revalidatePath("/pocket");
    return { ok: true, message: "Back on your list." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}
