"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Notice, PageTitle, cn } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isNoConnection, isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import { LengthPicker } from "@/components/length-picker";
import type { Length } from "@/lib/pocket-shape";
import { leaveToCommandCenter, makeMeetingFromPocket, makeWholeMeeting, skipPocket, undoPocket } from "./actions";

export interface PocketEntry {
  id: string;
  title: string;
  summary: string;
  /** "Today 7:47 PM · 3 min" */
  meta: string;
  /** "past": it was in a meeting that has ended (and the TV showed it). */
  decision: "meeting" | "past" | "command_center" | "skipped" | null;
  /** In the next meeting as a whole meeting of its own, at this length. */
  whole: Length | null;
}

type Kind = "meeting" | "whole" | "cc" | "skip" | "undo";
type Result = { ok: true; message?: string } | { ok: false; error: string };

/** How much of Pocket's summary a card shows before "Read all of it". */
const SHORT = 260;
const LENGTH_NAME: Record<Length, string> = { brief: "Brief", standard: "Standard", full: "Full" };

/**
 * His Pocket recordings as cards: Pocket's summary, then where it goes: a whole meeting of its
 * own, a thought in the next meeting, Command Center, or nowhere (Skip). Built for one thumb.
 */
export function PocketList({ entries, problem, saved, full }: { entries: PocketEntry[]; problem: string | null; saved: boolean; full: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [planning, setPlanning] = useState<string | null>(null);
  const [length, setLength] = useState<Length>("standard");
  const [ask, setAsk] = useState("");
  const [showSkipped, setShowSkipped] = useState(false);

  const run = (id: string, kind: Kind, fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setBusy(`${id}:${kind}`);
    start(async () => {
      const r = await safeAction(fn);
      setBusy(null);
      if (isStale(r)) {
        const why = reloadForUpdate();
        if (why) toast(why, false);
        return;
      }
      toast(r.ok ? (r.message ?? "Done.") : r.error, r.ok);
      // A success already brought the new page (the action revalidates it). A refusal means the
      // card changed on the server: load it as it is now. A lost connection changed nothing.
      if (!r.ok && !isNoConnection(r)) router.refresh();
      after?.(r);
    });
  };

  const btn = (e: PocketEntry, kind: Kind, label: string, doing: string, fn: () => Promise<Result>, tone: "red" | "soft" | "gray") => (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(e.id, kind, fn)}
      className={cn(
        "min-h-11 rounded-2xl px-2 text-[14px] font-extrabold disabled:opacity-50",
        tone === "red" ? "bg-tide-strong text-white shadow-glow" : tone === "soft" ? "bg-tint text-accent-text" : "bg-gray-100 text-gray-700",
      )}
    >
      {busy === `${e.id}:${kind}` ? doing : label}
    </button>
  );

  const wholePanel = (e: PocketEntry) => (
    <div className="mt-3 space-y-2.5 rounded-2xl bg-tint p-3">
      <p className="text-[14px] font-bold text-gray-900">A whole meeting from this recording</p>
      <LengthPicker value={length} onChange={setLength} />
      <textarea
        aria-label="Tell Claude (optional)"
        value={ask}
        onChange={(ev) => setAsk(ev.target.value.slice(0, 300))}
        rows={2}
        placeholder={'Optional: "skip the part about parking"'}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[16px] text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none"
      />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(e.id, "whole", () => makeWholeMeeting(e.id, length, ask), (r) => {
              if (r.ok) {
                setPlanning(null);
                setAsk("");
              }
            })
          }
          className="min-h-11 rounded-2xl bg-tide-strong px-3 text-[14px] font-extrabold text-white shadow-glow disabled:opacity-50"
        >
          {busy === `${e.id}:whole` ? "Claude is planning… (about a minute)" : "Make the meeting"}
        </button>
        <button type="button" disabled={pending} onClick={() => setPlanning(null)} className="min-h-11 rounded-2xl px-3 text-[14px] font-bold text-gray-600 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );

  const visible = entries.filter((e) => e.decision !== "skipped");
  const skipped = entries.filter((e) => e.decision === "skipped");
  const undecided = visible.filter((e) => !e.decision);

  const card = (e: PocketEntry) => {
    const long = e.summary.length > SHORT;
    const shown = long && !open.has(e.id) ? `${e.summary.slice(0, SHORT).replace(/\s+\S*$/, "")}…` : e.summary;
    return (
      <li key={e.id} className="rounded-[22px] bg-surface p-4 shadow-card">
        {e.meta && <p className="text-[12px] font-bold tracking-[0.04em] text-gray-500 uppercase">{e.meta}</p>}
        <p className="mt-1 text-[17px] leading-snug font-extrabold tracking-[-0.02em] text-gray-900">{e.title}</p>
        {e.summary ? (
          <>
            <p className="mt-1.5 text-[14px] leading-relaxed text-gray-700">{shown}</p>
            {long && (
              <button
                type="button"
                aria-expanded={open.has(e.id)}
                className="-ml-1 min-h-11 px-1 text-[14px] font-bold text-accent-text"
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(e.id)) n.delete(e.id);
                    else n.add(e.id);
                    return n;
                  })
                }
              >
                {open.has(e.id) ? "Show less" : "Read all of it"}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[14px] text-gray-500">Pocket&apos;s summary isn&apos;t ready yet.</p>
        )}
        {e.decision === "meeting" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="green">{e.whole ? `Whole meeting · ${LENGTH_NAME[e.whole]}` : "In the next meeting"}</Badge>
            <Link href="/" className="inline-flex min-h-11 items-center px-2 text-[14px] font-bold text-accent-text">
              Open
            </Link>
          </div>
        ) : e.decision === "command_center" || e.decision === "skipped" ? (
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="gray">{e.decision === "skipped" ? "Skipped" : "Left to Command Center"}</Badge>
            <button type="button" disabled={pending} onClick={() => run(e.id, "undo", () => undoPocket(e.id))} className="min-h-11 px-2 text-[14px] font-bold text-accent-text disabled:opacity-50">
              {busy === `${e.id}:undo` ? "Undoing…" : "Undo"}
            </button>
          </div>
        ) : planning === e.id ? (
          wholePanel(e)
        ) : (
          <div className="mt-3 space-y-2">
            {e.decision === "past" && <Badge tone="gray">Shown in an earlier meeting</Badge>}
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPlanning(e.id);
                  setLength("standard");
                  setAsk("");
                }}
                className="min-h-11 rounded-2xl bg-tide-strong px-2 text-[14px] font-extrabold text-white shadow-glow disabled:opacity-50"
              >
                Whole meeting
              </button>
              {btn(e, "meeting", e.decision === "past" ? "Show it again" : "Add to meeting", "Adding…", () => makeMeetingFromPocket(e.id), "soft")}
              {btn(e, "cc", "Command Center", "Saving…", () => leaveToCommandCenter(e.id), "gray")}
              {btn(e, "skip", "Skip", "Skipping…", () => skipPocket(e.id), "gray")}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageTitle sub="Your newest recordings, with Pocket's own summary. You decide where each one goes.">From Pocket</PageTitle>
      {problem && <Notice tone="amber">{entries.length ? `${problem} Showing what came in before.` : `${problem} Try again in a minute.`}</Notice>}
      {!saved && <Notice tone="amber">The Pocket list can&apos;t remember your choices yet: the database update for it hasn&apos;t run.</Notice>}
      {full && <Notice tone="blue">Showing your newest 50 recordings.</Notice>}
      {entries.length === 0 ? (
        !problem && (
          <div className="rounded-[22px] bg-surface px-5 py-8 text-center shadow-card">
            <p className="text-[16px] font-bold text-gray-900">No recordings this week</p>
            <p className="mt-1.5 text-[14px] text-gray-600">Record a thought on Pocket and it shows up here with its summary.</p>
          </div>
        )
      ) : (
        <>
          {undecided.length === 0 && <p className="px-1 text-[14px] text-gray-500">All caught up: every recording this week has a place.</p>}
          <ul className="space-y-3">{visible.map(card)}</ul>
          {skipped.length > 0 && (
            <div className="space-y-3">
              <button type="button" onClick={() => setShowSkipped((v) => !v)} className="min-h-11 px-1 text-[14px] font-bold text-gray-500">
                {showSkipped ? "Hide skipped" : `${skipped.length} skipped · Show`}
              </button>
              {showSkipped && <ul className="space-y-3">{skipped.map(card)}</ul>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
