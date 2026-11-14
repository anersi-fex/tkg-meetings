import type { Metadata } from "next";
import { after } from "next/server";
import { requirePage } from "@/lib/auth";
import { dbConfigured } from "@/lib/supabase";
import { ensureOpenMeeting, hasDraftToClaim, listItems } from "@/lib/data";
import { draftPending } from "@/lib/draft";
import { buildMeetingDeck, syncFromCommandCenter, type SyncResult } from "@/lib/meeting";
import { anthropicKey } from "@/lib/secrets";
import { NextMeeting } from "./next-meeting";

export const metadata: Metadata = { title: "Next meeting" };
export const dynamic = "force-dynamic";
// Drafting new thoughts runs after the page answered (after()), up to this long.
export const maxDuration = 300;

/** Waits for Command Center at most this long on a page load; the list shows either way. */
const SYNC_WAIT_MS = 8000;

export default async function NextMeetingPage() {
  await requirePage("owner");
  if (!dbConfigured()) return null;

  const meeting = await ensureOpenMeeting();
  const sync: SyncResult = await Promise.race([
    syncFromCommandCenter(meeting).catch((): SyncResult => {
      console.error("sync_failed");
      return { ok: false, message: "The new thoughts didn't save: tap Refresh in a moment.", kind: "tool" };
    }),
    new Promise<SyncResult>((resolve) => setTimeout(() => resolve({ ok: false, message: "Command Center is slow to answer: showing what came in before.", kind: "unreachable" }), SYNC_WAIT_MS)),
  ]);
  const items = await listItems(meeting.id);
  // Only when there is something to claim: a draft still running is left to its own run (this
  // page reloads every few seconds while one is).
  if (hasDraftToClaim(items)) {
    after(() => draftPending(meeting.id).then(() => undefined, () => undefined));
  }
  const deck = await buildMeetingDeck(meeting, items);
  const hasAi = !!(await anthropicKey());

  return <NextMeeting meeting={meeting} items={items} deck={deck} sync={sync} hasAi={hasAi} />;
}
