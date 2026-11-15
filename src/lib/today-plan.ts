/**
 * Today: the owner's one job is dialing (owner, 2026-11-15: "something that gets me to actually
 * dial... my number one focus"). His goal counts connections (people who picked up), 100 a day,
 * and his dial blocks are weekday hours. This decides the one thing the Today screen shows,
 * readable in a glance. Pure: the clock and the numbers come in.
 */

export interface Block {
  /** "HH:MM", 24-hour, Detroit time. */
  start: string;
  end: string;
}

export interface TodaySettings {
  goal: number;
  blocks: Block[];
}

export const DEFAULT_TODAY: TodaySettings = { goal: 100, blocks: [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "16:00" }] };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Settings as stored, checked: a goal of 1 to 1000, up to 4 blocks that start before they end, in order. */
export function cleanToday(v: unknown): TodaySettings {
  const o = (v && typeof v === "object" ? v : {}) as { goal?: unknown; blocks?: unknown };
  const goal = Math.round(Number(o.goal));
  const blocks = (Array.isArray(o.blocks) ? o.blocks : [])
    .map((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {}))
    .map((b) => ({ start: String(b.start ?? ""), end: String(b.end ?? "") }))
    .filter((b) => HHMM.test(b.start) && HHMM.test(b.end) && minutes(b.start) < minutes(b.end))
    .sort((a, b) => minutes(a.start) - minutes(b.start))
    .slice(0, 4);
  return { goal: goal >= 1 && goal <= 1000 ? goal : DEFAULT_TODAY.goal, blocks: Array.isArray(o.blocks) ? blocks : DEFAULT_TODAY.blocks };
}

/** "10 AM", "1:30 PM". */
export function clock(t: string): string {
  const m = minutes(t);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export type OneThing =
  | { kind: "dial"; title: string; line: string; block: Block }
  | { kind: "next"; title: string; line: string; block: Block }
  | { kind: "done"; title: string; line: string }
  | { kind: "off"; title: string; line: string };

/**
 * The one thing for right now. `now` is the Detroit wall clock: weekday 0 (Sunday) to 6 and
 * minutes since midnight. Goal met: done. In a dial block on a weekday: dial. Before the day's
 * next block: when it starts. After the last block, or on a weekend: off (with what's left).
 */
export function oneThing(s: TodaySettings, now: { weekday: number; minute: number }, connects: number | null): OneThing {
  const left = connects === null ? null : Math.max(0, s.goal - connects);
  const toGo = left === null ? `Goal: ${s.goal} connections` : `${left} connection${left === 1 ? "" : "s"} to go`;
  if (left === 0) return { kind: "done", title: "Goal hit", line: `${connects} connections today. That’s the day.` };
  const weekday = now.weekday >= 1 && now.weekday <= 5;
  if (!weekday) return { kind: "off", title: "Weekend", line: left === null ? "Rest up. Dial blocks start Monday." : `${toGo} if you want a head start.` };
  const inBlock = s.blocks.find((b) => now.minute >= minutes(b.start) && now.minute < minutes(b.end));
  if (inBlock) return { kind: "dial", title: "Dial now", line: `${toGo} · until ${clock(inBlock.end)}`, block: inBlock };
  const next = s.blocks.find((b) => minutes(b.start) > now.minute);
  if (next) return { kind: "next", title: `Next dial block ${clock(next.start)}`, line: `${toGo} · ${clock(next.start)}–${clock(next.end)}`, block: next };
  return { kind: "off", title: "Blocks are done for today", line: left === null ? "See you tomorrow." : `${toGo}. Dial now to close the gap.` };
}

/** Weekday and minutes since midnight in Detroit. */
export function detroitNow(d: Date): { weekday: number; minute: number; day: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, minute: Number(parts.hour) * 60 + Number(parts.minute), day: `${parts.year}-${parts.month}-${parts.day}` };
}
