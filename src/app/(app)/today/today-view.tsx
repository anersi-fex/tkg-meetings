"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Notice, cn } from "@/components/ui";
import type { DialStats } from "@/lib/dialrush-types";
import type { OneThing } from "@/lib/today-plan";

/** How often Today reads DialRush again while it is on screen. */
const REFRESH_MS = 60_000;

export function TodayView({ thing, goal, today, week, problem, signedOut }: { thing: OneThing; goal: number; today: DialStats | null; week: DialStats | null; problem: string | null; signedOut: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const connects = today?.connects ?? 0;
  const pct = Math.min(100, Math.round((connects / goal) * 100));
  const hot = thing.kind === "dial";
  return (
    <div className="space-y-4">
      {problem && (
        <Notice tone="amber">
          {problem}{" "}
          {signedOut ? (
            <Link href="/settings#dialrush" className="font-bold underline">
              Open Settings
            </Link>
          ) : (
            "Showing what it can."
          )}
        </Notice>
      )}

      <section className={cn("rounded-[26px] p-5 shadow-card", hot ? "bg-tide-strong text-white shadow-glow" : "bg-surface")}>
        <p className={cn("text-[12px] font-extrabold tracking-[0.08em] uppercase", hot ? "text-white opacity-80" : "text-gray-500")}>Your one thing</p>
        <p className={cn("mt-1 text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em]", hot ? "text-white" : "text-gray-900")}>{thing.title}</p>
        <p className={cn("mt-1.5 text-[15px] font-semibold", hot ? "text-white opacity-90" : "text-gray-600")}>{thing.line}</p>
        {(thing.kind === "dial" || thing.kind === "off") && (
          <a
            href="https://dialrush.com"
            target="_blank"
            rel="noreferrer"
            className={cn("mt-4 flex min-h-12 items-center justify-center rounded-2xl text-[17px] font-extrabold", hot ? "bg-surface text-accent-text" : "bg-tide-strong text-white shadow-glow")}
          >
            Open DialRush
          </a>
        )}
      </section>

      <section className="rounded-[22px] bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-bold text-gray-900">Connections today</p>
          <p className="font-mono text-[15px] font-bold text-gray-500">goal {goal}</p>
        </div>
        <p className="mt-1 font-mono text-[44px] leading-none font-bold tracking-[-0.02em] text-gray-900">
          {today ? connects : "–"}
          <span className="text-[20px] text-gray-400"> / {goal}</span>
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={connects} aria-valuemin={0} aria-valuemax={goal} aria-label="Connections toward today's goal">
          <div className="h-full rounded-full bg-tide-strong" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Dials" value={today?.dials} />
          <Stat label="Appointments" value={today?.appointments} />
          <Stat label="Talk min" value={today ? Math.round(today.talkSeconds / 60) : undefined} />
        </div>
      </section>

      {week && (
        <p className="px-1 text-[14px] text-gray-500">
          Last 7 days: <span className="font-mono font-bold text-gray-700">{week.connects}</span> connections, <span className="font-mono font-bold text-gray-700">{week.appointments}</span> appointments,{" "}
          <span className="font-mono font-bold text-gray-700">{week.dials}</span> dials.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-2 py-2.5">
      <p className="font-mono text-[22px] font-bold text-gray-900">{value ?? "–"}</p>
      <p className="text-[11px] font-bold tracking-[0.04em] text-gray-500 uppercase">{label}</p>
    </div>
  );
}
