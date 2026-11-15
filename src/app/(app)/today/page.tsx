import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getSetting } from "@/lib/data";
import { dialRushConnected, dialStats, DialRushError, type DialStats } from "@/lib/dialrush";
import { cleanToday, detroitNow, oneThing } from "@/lib/today-plan";
import { TodayView } from "./today-view";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * Today: the one thing to do right now (dialing, most of the day), and today's connections from
 * DialRush against his goal. Built to be read in a glance between conversations.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ dialrush?: string }> }) {
  await requirePage("owner");
  const sp = await searchParams;
  const settings = cleanToday(await getSetting("today").catch(() => null));
  const now = new Date();
  const clock = detroitNow(now);
  const connected = await dialRushConnected();

  let today: DialStats | null = null;
  let week: DialStats | null = null;
  let problem: string | null = null;
  if (connected) {
    try {
      [today, week] = await Promise.all([dialStats("today"), dialStats("7d")]);
    } catch (err) {
      problem = err instanceof DialRushError ? err.message : "DialRush didn't answer.";
    }
  }
  const thing = oneThing(settings, clock, today ? today.connects : null);

  if (!connected) {
    return (
      <div className="space-y-4">
        <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.03em] text-gray-900">Today</h1>
        <div className="rounded-[22px] bg-surface px-5 py-7 text-center shadow-card">
          <p className="text-[17px] font-bold text-gray-900">Connect DialRush</p>
          <p className="mt-1.5 text-[14px] text-gray-600">Your connections fill in on their own: sign in to DialRush once and tap Approve.</p>
          <Link href="/api/dialrush/connect" prefetch={false} className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-tide-strong px-5 text-[15px] font-bold text-white shadow-glow">
            Connect DialRush
          </Link>
          {sp.dialrush === "failed" && <p className="mt-3 text-[13px] font-semibold text-red-700">That didn&apos;t connect. Try again.</p>}
        </div>
      </div>
    );
  }

  return <TodayView thing={thing} goal={settings.goal} today={today} week={week} problem={problem} justConnected={sp.dialrush === "connected"} />;
}
