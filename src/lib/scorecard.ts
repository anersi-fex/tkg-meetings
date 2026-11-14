import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db, freshFetch } from "./supabase";
import { addMonths, daysLeftLabel, monthClock, monthKeyOf } from "./month";
import type { ScoreSnapshot } from "./deck";
import type { ScoreboardMonth } from "./types";

/**
 * Read-only numbers from Scorecard (anersi-fex/tkg-scorecard): the month's life total, policies
 * and goal for the Scoreboard slide, and how Scorecard spells the team and the carriers (the AI
 * drafts names that way). Everything goes through two functions in Scorecard's database
 * (supabase/scorecard/meetings_feed.sql), which return those totals and names and nothing else: no
 * client, no policy detail. With SCORECARD_SUPABASE_URL and SCORECARD_SUPABASE_KEY (Scorecard's
 * publishable key, which opens no table) Meetings reads them from Scorecard's own project;
 * without them, from the project it runs on (when Meetings shares Scorecard's database).
 * Never writes. Any failure means "no scoreboard", never an error on the page.
 */

let other: SupabaseClient | null = null;

function scorecardDb(): SupabaseClient {
  const url = process.env.SCORECARD_SUPABASE_URL?.trim();
  const key = process.env.SCORECARD_SUPABASE_KEY?.trim();
  if (url && key) {
    other ??= createClient(url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""), key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: freshFetch } });
    return other;
  }
  return db();
}

/** The month the slide shows: "auto" looks back at last month in the first five days of a month. */
export function scoreMonth(which: ScoreboardMonth, today: string): string {
  const current = monthKeyOf(today);
  if (which === "last") return addMonths(current, -1);
  if (which === "this") return current;
  return Number(today.slice(8, 10)) <= 5 ? addMonths(current, -1) : current;
}

export async function readScore(which: ScoreboardMonth, today: string): Promise<ScoreSnapshot | null> {
  const key = scoreMonth(which, today);
  try {
    const { data, error } = await scorecardDb().rpc("meetings_scorecard_month", { p_month: key, p_through: today });
    const row = Array.isArray(data) ? (data[0] as { total_cents?: unknown; policies?: unknown; goal_cents?: unknown } | undefined) : undefined;
    if (error || !row) return null;
    const total = Number(row.total_cents ?? 0);
    const policies = Number(row.policies ?? 0);
    const clock = monthClock(key, today);
    return {
      monthKey: key,
      totalCents: total,
      goalCents: Number(row.goal_cents ?? 0),
      policies,
      final: clock.position === "past",
      daysLeft: daysLeftLabel(clock),
      readOn: today,
    };
  } catch {
    return null;
  }
}

/** The team's first names and the carriers as Scorecard has them (empty lists when it can't say). */
export async function scorecardNames(): Promise<{ people: string[]; carriers: string[] }> {
  try {
    const { data, error } = await scorecardDb().rpc("meetings_scorecard_names");
    const row = Array.isArray(data) ? (data[0] as { people?: unknown; carriers?: unknown } | undefined) : undefined;
    if (error || !row) return { people: [], carriers: [] };
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : []);
    return { people: strings(row.people).slice(0, 100), carriers: strings(row.carriers).slice(0, 50) };
  } catch {
    return { people: [], carriers: [] };
  }
}
