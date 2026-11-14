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
// not answer. The limits: 10 wrong passwords per address in 15 minutes, and 500 across every
// address (a refused try is not recorded, so one stranger locks only themselves out, never the
// owner or the TV). Only the owner's password clears an address's wrong tries; the team password
// (typed on the shared office TV) takes back only its own try.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const tries = new Map<string, { count: number; resetAt: number }>();

export type LoginAttempt = { allowed: false } | { allowed: true; ip: string; id: number | null };

/** Counts one sign-in try from this address; refused when it is over the limit. */
export async function beginLoginAttempt(ip: string): Promise<LoginAttempt> {
  const key = ip.slice(0, 64) || "unknown";
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
    if (data == null) return { allowed: false };
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
