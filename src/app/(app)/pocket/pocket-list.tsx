"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Notice, PageTitle } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import { leaveToCommandCenter, makeMeetingFromPocket, undoPocket } from "./actions";

export interface PocketEntry {
  id: string;
  title: string;
  summary: string;
  /** "Fri 7:47 PM · 3 min" */
  meta: string;
  /** "past": it was in a meeting that has ended. */
  decision: "meeting" | "past" | "command_center" | null;
}

/** How much of Pocket's summary a card shows before "More". */
const SHORT = 260;

/**
 * His Pocket recordings as cards: Pocket's summary, then Make a meeting or Command Center. A
 * decided card says where it went. Built for one thumb on an iPhone.
 */
export function PocketList({ entries, problem, saved }: { entries: PocketEntry[]; problem: string | null; saved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const run = (id: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setBusy(id);
    start(async () => {
      const r = await safeAction(fn);
      setBusy(null);
      if (isStale(r)) {
        const why = reloadForUpdate();
        if (why) toast(why, false);
        return;
      }
      toast(r.ok ? (r.message ?? "Done.") : r.error, r.ok);
      if (r.ok) router.refresh();
    });
  };

  const undecided = entries.filter((e) => !e.decision);
  const makeButton = (e: PocketEntry, label: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(e.id, () => makeMeetingFromPocket(e.id))}
      className="min-h-11 rounded-2xl bg-tide-strong px-3 text-[14px] font-extrabold text-white shadow-glow disabled:opacity-50"
    >
      {busy === e.id ? "Adding…" : label}
    </button>
  );
  return (
    <div className="space-y-4">
      <PageTitle sub="Your newest recordings, with Pocket's own summary. You decide where each one goes.">From Pocket</PageTitle>
      {problem && <Notice tone="amber">{problem} Showing what came in before.</Notice>}
      {!saved && <Notice tone="amber">The Pocket list can&apos;t remember your choices yet: the database update for it hasn&apos;t run.</Notice>}
      {entries.length === 0 ? (
        <div className="rounded-[22px] bg-surface px-5 py-8 text-center shadow-card">
          <p className="text-[16px] font-bold text-gray-900">No recordings this week</p>
          <p className="mt-1.5 text-[14px] text-gray-600">Record a thought on Pocket and it shows up here with its summary.</p>
        </div>
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
                    <p className="mt-1.5 text-[14px] leading-relaxed text-gray-700">
                      {shown}
                      {long && (
                        <button
                          type="button"
                          className="ml-1 font-bold text-accent-text"
                          onClick={() =>
                            setOpen((s) => {
                              const n = new Set(s);
                              if (n.has(e.id)) n.delete(e.id);
                              else n.add(e.id);
                              return n;
                            })
                          }
                        >
                          {open.has(e.id) ? "Less" : "More"}
                        </button>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[14px] text-gray-500">Pocket&apos;s summary isn&apos;t ready yet.</p>
                  )}
                  {e.decision === "meeting" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="green">In the next meeting</Badge>
                      <Link href="/" className="text-[13px] font-bold text-accent-text">
                        Open
                      </Link>
                    </div>
                  ) : e.decision === "past" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone="gray">Was in an earlier meeting</Badge>
                      {makeButton(e, "Make a meeting again")}
                    </div>
                  ) : e.decision === "command_center" ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="gray">Left to Command Center</Badge>
                      <button type="button" disabled={pending} onClick={() => run(e.id, () => undoPocket(e.id))} className="min-h-11 px-1 text-[13px] font-bold text-accent-text disabled:opacity-50">
                        Undo
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {makeButton(e, "Make a meeting")}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(e.id, () => leaveToCommandCenter(e.id))}
                        className="min-h-11 rounded-2xl bg-gray-100 px-3 text-[14px] font-extrabold text-gray-700 disabled:opacity-50"
                      >
                        Command Center
                      </button>
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
