import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db, freshFetch } from "./supabase";
import { addMonths, daysLeftLabel, monthClock, monthKeyOf, datesOfMonth } from "./month";
import type { ScoreSnapshot } from "./deck";
import type { ScoreboardMonth } from "./types";

/**
 * Read-only numbers from Scorecard (anersi-fex/tkg-scorecard): the month's premium, policies and
 * goal for the scoreboard slide, and how Scorecard spells the team and the carriers (the AI
 * drafts names that way). Meetings normally shares Scorecard's Supabase project, so this reads
 * Scorecard's own tables (sales, goals, agents, settings) with the same client; set
 * SCORECARD_SUPABASE_URL and SCORECARD_SUPABASE_SERVICE_ROLE_KEY to read another project.
 * Never writes. Any failure means "no scoreboard", never an error on the page.
 */

let other: SupabaseClient | null = null;

function scorecardDb(): SupabaseClient {
  const url = process.env.SCORECARD_SUPABASE_URL;
  const key = process.env.SCORECARD_SUPABASE_SERVICE_ROLE_KEY;
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
  const dates = datesOfMonth(key);
  try {
    const sc = scorecardDb();
    const [sales, goal] = await Promise.all([
      sc.from("sales").select("premium_cents,policies").is("deleted_at", null).gte("sold_on", dates[0]).lte("sold_on", dates[dates.length - 1]).range(0, 9999),
      sc.from("goals").select("team_cents").eq("month", key).maybeSingle(),
    ]);
    if (sales.error) return null;
    let total = 0;
    let policies = 0;
    for (const r of sales.data ?? []) {
      total += Number(r.premium_cents ?? 0);
      policies += Number(r.policies ?? 0);
    }
    const clock = monthClock(key, today);
    return {
      monthKey: key,
      totalCents: total,
      goalCents: goal.error ? 0 : Number(goal.data?.team_cents ?? 0),
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
    const sc = scorecardDb();
    const [agents, settings] = await Promise.all([sc.from("agents").select("name,active").eq("active", true).limit(100), sc.from("settings").select("value").eq("key", "app").maybeSingle()]);
    const people = agents.error ? [] : (agents.data ?? []).map((a) => String(a.name ?? "").trim()).filter(Boolean);
    const raw = settings.error ? null : (settings.data?.value as { carriers?: unknown } | null);
    const carriers = Array.isArray(raw?.carriers) ? raw.carriers.filter((c): c is string => typeof c === "string") : [];
    return { people, carriers };
  } catch {
    return { people: [], carriers: [] };
  }
}
