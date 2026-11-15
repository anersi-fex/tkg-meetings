import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth";
import { appBase } from "@/lib/app-url";
import { DialRushError, startDialRushSignIn } from "@/lib/dialrush";

/**
 * Step 1 of connecting DialRush (owner only): registers the app with DialRush the first time and
 * opens DialRush's sign-in. After Approve, DialRush sends the browser to a loopback address that
 * does not load; he pastes that address in Settings (step 2).
 */
export async function GET() {
  const base = await appBase();
  if ((await currentRole()) !== "owner") return NextResponse.redirect(new URL("/login?next=/settings", base));
  try {
    return NextResponse.redirect(await startDialRushSignIn());
  } catch (err) {
    console.error("dialrush_start_failed", err instanceof DialRushError ? err.kind : "error");
    return NextResponse.redirect(new URL("/settings?dialrush=failed#dialrush", base));
  }
}
