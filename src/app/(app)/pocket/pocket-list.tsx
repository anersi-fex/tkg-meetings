"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Notice, PageTitle } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isNoConnection, isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import { leaveToCommandCenter, makeMeetingFromPocket, undoPocket } from "./actions";

export interface PocketEntry {
  id: string;
  title: string;
  summary: string;
  /** "Today 7:47 PM · 3 min" */
  meta: string;
  /** "past": it was in a meeting that has ended (and the TV showed it). */
  decision: "meeting" | "past" | "command_center" | null;
}

type Kind = "meeting" | "cc" | "undo";

/** How much of Pocket's summary a card shows before "Read all of it". */
const SHORT = 260;

/**
 * His Pocket recordings as cards: Pocket's summary, then Make a meeting or Command Center. A
 * decided card says where it went. Built for one thumb on an iPhone.
 */
export function PocketList({ entries, problem, saved, full }: { entries: PocketEntry[]; problem: string | null; saved: boolean; full: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const run = (id: string, kind: Kind, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
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
    });
  };

  const makeButton = (e: PocketEntry, label: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(e.id, "meeting", () => makeMeetingFromPocket(e.id))}
      className="min-h-11 rounded-2xl bg-tide-strong px-3 text-[14px] font-extrabold text-white shadow-glow disabled:opacity-50"
    >
      {busy === `${e.id}:meeting` ? "Adding…" : label}
    </button>
  );
  const ccButton = (e: PocketEntry) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(e.id, "cc", () => leaveToCommandCenter(e.id))}
      className="min-h-11 rounded-2xl bg-gray-100 px-3 text-[14px] font-extrabold text-gray-700 disabled:opacity-50"
    >
      {busy === `${e.id}:cc` ? "Saving…" : "Command Center"}
    </button>
  );

  const undecided = entries.filter((e) => !e.decision);
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
          <ul className="space-y-3">
            {entries.map((e) => {
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
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="green">In the next meeting</Badge>
                      <Link href="/" className="inline-flex min-h-11 items-center px-2 text-[14px] font-bold text-accent-text">
                        Open
                      </Link>
                    </div>
                  ) : e.decision === "past" ? (
                    <div className="mt-3 space-y-2">
                      <Badge tone="gray">Shown in an earlier meeting</Badge>
                      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                        {makeButton(e, "Show it again")}
                        {ccButton(e)}
                      </div>
                    </div>
                  ) : e.decision === "command_center" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="gray">Left to Command Center</Badge>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(e.id, "undo", () => undoPocket(e.id))}
                        className="min-h-11 px-2 text-[14px] font-bold text-accent-text disabled:opacity-50"
                      >
                        {busy === `${e.id}:undo` ? "Undoing…" : "Undo"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                      {makeButton(e, "Make a meeting")}
                      {ccButton(e)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
