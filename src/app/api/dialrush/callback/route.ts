import { NextResponse, type NextRequest } from "next/server";
import { currentRole } from "@/lib/auth";
import { appBase } from "@/lib/app-url";
import { DialRushError, finishDialRushConnect } from "@/lib/dialrush";

/** Where DialRush sends him back after he approves (owner only): the code becomes the app's tokens. */
export async function GET(req: NextRequest) {
  const base = await appBase();
  if ((await currentRole()) !== "owner") return NextResponse.redirect(new URL("/login?next=/settings", base));
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || !state || code.length > 2000 || state.length > 200) return NextResponse.redirect(new URL("/settings?dialrush=failed", base));
  try {
    await finishDialRushConnect(code, state);
    return NextResponse.redirect(new URL("/today?dialrush=connected", base));
  } catch (err) {
    console.error("dialrush_callback_failed", err instanceof DialRushError ? err.kind : "error");
    return NextResponse.redirect(new URL("/settings?dialrush=failed", base));
  }
}
