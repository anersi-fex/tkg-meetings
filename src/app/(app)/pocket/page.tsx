import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { pocketKey } from "@/lib/secrets";
import { fetchRecording, listRecentRecordings, PocketError } from "@/lib/pocket";
import { cachePocket, ensureOpenMeeting, listItems, markPocketChecked, pocketRows, recentPocketRows, type PocketRow } from "@/lib/data";
import { carryPocketThoughts } from "@/lib/meeting";
import { recordingOfCard, whenLabel, type Length, type PocketRecording } from "@/lib/pocket-shape";
import { PageTitle } from "@/components/ui";
import { PocketList, type PocketEntry } from "./pocket-list";

export const metadata: Metadata = { title: "Pocket" };
export const dynamic = "force-dynamic";
// "Make a meeting" runs from this page and drafts in after(): the same 300 s the drafting clock counts on.
export const maxDuration = 300;

/** Summaries asked of Pocket per page load, how long to wait for them, and how soon to ask again about one Pocket had none for. */
const SUMMARIES_PER_LOAD = 8;
const WAIT_MS = 9_000;
const ASK_AGAIN_MS = 20 * 60_000;
/** Pocket's list answers at most this many: more in a week is said on the screen, not dropped silently. */
const LIST_LIMIT = 50;
const WEEK_MS = 7 * 86_400_000;

/**
 * The Pocket screen: his recordings of the last week, newest first, each with Pocket's own summary
 * and what he decided (make it a meeting, or leave it to Command Center). Summaries are kept in
 * mtg_pocket so the list opens fast; a recording without one is asked of Pocket, a few per look.
 * When Pocket does not answer, the kept recordings show.
 */
export default async function PocketPage() {
  await requirePage("owner");
  if (!(await pocketKey())) {
    return (
      <div>
        <PageTitle sub="Your newest recordings, with Pocket's own summary.">From Pocket</PageTitle>
        <div className="rounded-[22px] bg-surface px-5 py-8 text-center shadow-card">
          <p className="text-[16px] font-bold text-gray-900">Pocket isn&apos;t connected yet</p>
          <p className="mt-1.5 text-[14px] text-gray-600">Paste your Pocket API key in Settings, and your recordings show up here.</p>
          <Link href="/settings" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-tide-strong px-5 text-sm font-bold text-white shadow-glow">
            Open Settings
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  let listed: PocketRecording[] = [];
  let problem: string | null = null;
  try {
    listed = await listRecentRecordings(7);
  } catch (err) {
    problem = err instanceof PocketError ? err.message : "Pocket didn't answer.";
  }

  let saved = true;
  let kept = new Map<string, PocketRow>();
  try {
    if (problem) {
      // Pocket is down or slow: the recordings kept from earlier looks, with their summaries.
      const rows = await recentPocketRows(new Date(now.getTime() - WEEK_MS).toISOString());
      kept = new Map(rows.map((r) => [r.recording_id, r]));
      listed = rows.map((r) => ({ id: r.recording_id, title: r.title, recordedAt: r.recorded_at, durationSec: r.duration_sec, summary: r.summary, transcript: "" }));
    } else kept = await pocketRows(listed.map((r) => r.id));
  } catch {
    saved = false;
  }

  // Pocket's summary: from the list when it has it, else what was kept, else ask for a few now
  // (each on its own clock, so one slow answer does not throw away the others).
  const summaryOf = new Map<string, string>();
  for (const r of listed) {
    const s = r.summary || kept.get(r.id)?.summary || "";
    if (s) summaryOf.set(r.id, s);
  }
  if (!problem) {
    const recent = (iso: string | null | undefined) => !!iso && now.getTime() - new Date(iso).getTime() < ASK_AGAIN_MS;
    const ask = listed.filter((r) => !summaryOf.has(r.id) && !kept.get(r.id)?.decision && !recent(kept.get(r.id)?.checked_at)).slice(0, SUMMARIES_PER_LOAD);
    const none: string[] = [];
    if (ask.length) {
      const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
      const got = await Promise.all(ask.map((r) => Promise.race([fetchRecording(r.id).catch(() => null), deadline])));
      got.forEach((g, i) => {
        if (g?.summary) summaryOf.set(ask[i].id, g.summary);
        else if (g) none.push(ask[i].id);
      });
    }
    if (saved) {
      const toKeep = listed
        .filter((r) => !kept.has(r.id) || (summaryOf.get(r.id) && !kept.get(r.id)?.summary))
        .map((r) => ({ recording_id: r.id, title: r.title, summary: summaryOf.get(r.id) ?? "", recorded_at: r.recordedAt, duration_sec: r.durationSec }));
      await cachePocket(toKeep).catch(() => undefined);
      await markPocketChecked(none).catch(() => undefined);
    }
  }

  // Which recordings are in the next meeting now. A Pocket thought a meeting ended without reaching
  // is brought into the next one first, so it never reads "earlier meeting" by mistake.
  const inNext = new Set<string>();
  const wholeOf = new Map<string, Length>();
  let nextKnown = true;
  try {
    const open = await ensureOpenMeeting();
    await carryPocketThoughts(open).catch(() => 0);
    const openItems = await listItems(open.id);
    const itemIds = new Set(openItems.map((i) => i.id));
    for (const i of openItems) {
      const rec = recordingOfCard(i.card_id);
      if (rec && i.card.whole) wholeOf.set(rec, i.card.whole.length);
    }
    if (saved) kept = await pocketRows(listed.map((r) => r.id));
    for (const [id, row] of kept) if (row.decision === "meeting" && row.item_id && itemIds.has(row.item_id)) inNext.add(id);
  } catch {
    nextKnown = false;
  }

  const entries: PocketEntry[] = listed.map((r) => {
    const row = kept.get(r.id);
    const decision = row?.decision === "meeting" ? (inNext.has(r.id) || !nextKnown ? "meeting" : "past") : (row?.decision ?? null);
    return { id: r.id, title: r.title || row?.title || "A Pocket recording", summary: summaryOf.get(r.id) ?? "", meta: whenLabel(r.recordedAt, r.durationSec, now), decision, whole: decision === "meeting" ? (wholeOf.get(r.id) ?? null) : null };
  });

  return <PocketList entries={entries} problem={problem} saved={saved} full={!problem && listed.length >= LIST_LIMIT} />;
}
