"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { beginLoginAttempt, roleForPassword, settleLoginAttempt } from "@/lib/auth";
import { createSessionToken, passwordFor, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { safeNextPath } from "@/lib/safe-next";

export type LoginState = { error: string | null };

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  if (!passwordFor("owner")) return { error: "The app has no password yet. Add OWNER_PASSWORD in Vercel (see SETUP.md)." };
  // Counted before the check, so tries sent all at once are counted one by one.
  const attempt = await beginLoginAttempt(await clientIp());
  if (!attempt.allowed) return { error: "Too many tries. Wait 15 minutes and try again." };
  const role = roleForPassword(password);
  await settleLoginAttempt(attempt, role);
  if (!role) return { error: "That password isn't right." };
  const token = await createSessionToken(role, SESSION_TTL_SECONDS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(next);
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
