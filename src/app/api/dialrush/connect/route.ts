import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth";
import { appBase } from "@/lib/app-url";
import { DialRushError, startDialRushConnect } from "@/lib/dialrush";

/** Starts the DialRush sign-in (owner only): registers the app with DialRush once, then sends him there. */
export async function GET() {
  if ((await currentRole()) !== "owner") return NextResponse.redirect(new URL("/login?next=/settings", await appBase()));
  const base = await appBase();
  try {
    return NextResponse.redirect(await startDialRushConnect(base));
  } catch (err) {
    console.error("dialrush_connect_failed", err instanceof DialRushError ? err.kind : "error");
    return NextResponse.redirect(new URL("/settings?dialrush=failed", base));
  }
}
