import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual, createHash } from "crypto";
import { verifySessionToken, SESSION_COOKIE, passwordFor, type Role } from "./session";
import { db } from "./supabase";

/**
 * Session checks. proxy.ts is only an optimistic gate (Next 16): every page calls requirePage()
 * and every server action and route handler calls requireRole() before touching data.
 * Two roles: the owner (plans the meeting and runs the show) and the team (the office TV).
 */
export const OWNER_NAME = "Anersi Koka";

export async function currentRole(): Promise<Role | null> {
  try {
    const store = await cookies();
    return await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Pages and layouts: bounce to /login without a valid session; the role for what to show. */
export async function requirePage(need: Role | "any" = "any"): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/login");
  if (need === "owner" && role !== "owner") redirect("/tv");
  return role;
}

/** Server actions and route handlers: throw instead of redirecting. */
export async function requireRole(need: Role | "any" = "any"): Promise<Role> {
  const role = await currentRole();
  if (!role) throw new Error("Not signed in");
  if (need === "owner" && role !== "owner") throw new Error("Only the owner can do that");
  return role;
}

/**
 * Which role a typed password unlocks, in constant time (both sides hashed first, so lengths
 * never leak; both passwords are always checked, so a right owner password takes as long as a
 * right team one). The owner's password wins when the two are the same.
 */
export function roleForPassword(supplied: string): Role | null {
  if (!supplied) return null;
  const a = createHash("sha256").update(supplied).digest();
  let found: Role | null = null;
  for (const role of ["team", "owner"] as const) {
    const expected = passwordFor(role);
    if (!expected) continue;
    const b = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(a, b)) found = role;
  }
  return found;
}

// Login throttle. Every try is counted before the password is checked (a burst of tries sent at
// once is counted one by one): in the database by mtg_login_attempt (one address at a time, holds
// across serverless instances), and in a per-instance map that still holds when the database does
// not answer. The limits: 10 tries per address in 15 minutes; and during a flood (500 tries from
// every address together in 15 minutes) one try per address. A refused try is not recorded, and a
// fresh address always gets its try, so no stranger can lock out the owner on a new phone or the
// TV: a flood only buys its sender one guess per address it owns. An IPv6 address counts by its
// /64 (addressKey), so one machine cannot make up fresh addresses. Only the owner's password
// clears an address's tries; the team password (typed on the shared office TV) takes back only
// its own try.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const tries = new Map<string, { count: number; resetAt: number }>();

/**
 * The address a sign-in try is counted under: an IPv4 address as it is (also when written as
 * IPv6, ::ffff:1.2.3.4), an IPv6 address by its first 64 bits (one home or phone network gets a
 * whole /64 and could change the rest at will), anything else as given (at most 64 characters).
 * Pure.
 */
export function addressKey(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("[")) ip = ip.slice(1, ip.includes("]") ? ip.indexOf("]") : undefined); // [v6]:port
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone); // fe80::1%eth0
  const v4 = /^(?:::ffff:(?:0{1,4}:)?)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4) return v4[1];
  if (ip.includes(":")) {
    const halves = ip.split("::");
    if (halves.length <= 2) {
      const part = (h: string | undefined) => (h ? h.split(":") : []);
      // A dotted IPv4 tail fills the last two groups.
      const groupsOf = (list: string[]) => list.flatMap((g) => (g.includes(".") ? ["0", "0"] : [g]));
      const head = groupsOf(part(halves[0]));
      const tail = groupsOf(part(halves[1]));
      const missing = 8 - head.length - tail.length;
      const ok = halves.length === 2 ? missing >= 1 : missing === 0;
      const groups = [...head, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...tail];
      if (ok && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
        return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
      }
    }
  }
  return ip.slice(0, 64) || "unknown";
}

export type LoginAttempt = { allowed: false } | { allowed: true; ip: string; id: number | null };

/** Counts one sign-in try from this address; refused when it is over the limit. */
export async function beginLoginAttempt(ip: string): Promise<LoginAttempt> {
  const key = addressKey(ip);
  const now = Date.now();
  let entry = tries.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    tries.set(key, entry);
  }
  if (entry.count >= MAX_PER_IP) return { allowed: false };
  entry.count += 1;
  if (tries.size > 5000) for (const [k, v] of tries) if (v.resetAt < now) tries.delete(k);
  try {
    const { data, error } = await db().rpc("mtg_login_attempt", { p_ip: key });
    // The database didn't answer: this instance's count still holds.
    if (error) return { allowed: true, ip: key, id: null };
    if (data == null) {
      // Refused there, so not recorded there: not counted here either (a try refused during a
      // flood never keeps the owner out after it).
      entry.count = Math.max(0, entry.count - 1);
      return { allowed: false };
    }
    return { allowed: true, ip: key, id: Number(data) };
  } catch {
    return { allowed: true, ip: key, id: null };
  }
}

/**
 * After the password was checked: a wrong one stays counted; the owner's clears the address's
 * wrong tries (an earlier typo never counts); the team's takes back only its own try.
 */
export async function settleLoginAttempt(attempt: Extract<LoginAttempt, { allowed: true }>, role: Role | null): Promise<void> {
  if (!role) return;
  try {
    if (role === "owner") {
      tries.delete(attempt.ip);
      await db().from("mtg_login_attempts").delete().eq("ip", attempt.ip);
      return;
    }
    const entry = tries.get(attempt.ip);
    if (entry && entry.count > 0) entry.count -= 1;
    if (attempt.id != null) await db().from("mtg_login_attempts").delete().eq("id", attempt.id);
  } catch {
    /* best effort */
  }
}
