import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { pocketKey } from "@/lib/secrets";
import { fetchRecording, listRecentRecordings, PocketError } from "@/lib/pocket";
import { cachePocket, getOpenMeeting, listItems, pocketRows, type PocketRow } from "@/lib/data";
import { POCKET_PREFIX, type PocketRecording } from "@/lib/pocket-shape";
import { PageTitle } from "@/components/ui";
import { PocketList, type PocketEntry } from "./pocket-list";

export const metadata: Metadata = { title: "Pocket" };
export const dynamic = "force-dynamic";
// "Make a meeting" runs from this page and drafts in after(): the same 300 s the drafting clock counts on.
export const maxDuration = 300;

/** Summaries asked of Pocket per page load (the rest come on the next look), and how long to wait. */
const SUMMARIES_PER_LOAD = 8;
const WAIT_MS = 9_000;

const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", weekday: "short", hour: "numeric", minute: "2-digit" });

function label(rec: { recordedAt: string | null; durationSec: number | null }): string {
  const parts: string[] = [];
  if (rec.recordedAt) parts.push(when.format(new Date(rec.recordedAt)));
  if (rec.durationSec != null) parts.push(rec.durationSec < 60 ? "under 1 min" : `${Math.round(rec.durationSec / 60)} min`);
  return parts.join(" · ");
}

/**
 * The Pocket screen: his recordings of the last week, newest first, each with Pocket's own summary
 * and what he decided (make it a meeting, or leave it to Command Center). Summaries are kept in
 * mtg_pocket so the list opens fast; a recording without one is asked of Pocket, a few per look.
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

  let listed: PocketRecording[] = [];
  let problem: string | null = null;
  try {
    listed = await listRecentRecordings(7);
  } catch (err) {
    problem = err instanceof PocketError ? err.message : "Pocket didn't answer.";
  }

  let kept = new Map<string, PocketRow>();
  let saved = true;
  try {
    kept = await pocketRows(listed.map((r) => r.id));
  } catch {
    saved = false;
  }
  // Which recordings are in the next meeting now (a meeting that ended took its thoughts with it).
  const inNext = new Set<string>();
  try {
    const open = await getOpenMeeting();
    for (const i of open ? await listItems(open.id) : []) if (i.card_id?.startsWith(POCKET_PREFIX)) inNext.add(i.card_id.slice(POCKET_PREFIX.length));
  } catch {
    // Unknown: a "meeting" decision shows as in the next meeting.
    for (const [id, row] of kept) if (row.decision === "meeting") inNext.add(id);
  }

  // Pocket's summary: from the list when it has it, else what was kept, else ask for a few now.
  const summaryOf = new Map<string, string>();
  for (const r of listed) {
    const s = r.summary || kept.get(r.id)?.summary || "";
    if (s) summaryOf.set(r.id, s);
  }
  const ask = listed.filter((r) => !summaryOf.has(r.id) && !kept.get(r.id)?.decision).slice(0, SUMMARIES_PER_LOAD);
  if (ask.length) {
    const got = await Promise.race([
      Promise.allSettled(ask.map((r) => fetchRecording(r.id))),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
    ]);
    for (const g of got ?? []) if (g.status === "fulfilled" && g.value.summary) summaryOf.set(g.value.id, g.value.summary);
  }
  if (saved) {
    const toKeep = listed
      .filter((r) => !kept.has(r.id) || (summaryOf.get(r.id) && !kept.get(r.id)?.summary))
      .map((r) => ({ recording_id: r.id, title: r.title, summary: summaryOf.get(r.id) ?? "", recorded_at: r.recordedAt, duration_sec: r.durationSec }));
    await cachePocket(toKeep).catch(() => undefined);
  }

  const entries: PocketEntry[] = listed.map((r) => ({
    id: r.id,
    title: r.title || kept.get(r.id)?.title || "A Pocket recording",
    summary: summaryOf.get(r.id) ?? "",
    meta: label(r),
    decision: inNext.has(r.id) ? "meeting" : kept.get(r.id)?.decision === "meeting" ? "past" : (kept.get(r.id)?.decision ?? null),
  }));

  return <PocketList entries={entries} problem={problem} saved={saved} />;
}
