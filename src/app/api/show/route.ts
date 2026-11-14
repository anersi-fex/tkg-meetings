import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth";
import { showState } from "@/lib/meeting";

export const dynamic = "force-dynamic";

/**
 * The live show for the TV and the clicker: which slide is on and how many there are. The deck
 * itself rides along only when the caller's copy (?v=) is out of date, so the TV's once-a-second
 * poll stays tiny. Any signed-in viewer (the TV signs in with the team password).
 */
export async function GET(request: Request) {
  if (!(await currentRole())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const v = new URL(request.url).searchParams.get("v");
  const known = v != null && /^\d{1,9}$/.test(v) ? Number(v) : null;
  try {
    return NextResponse.json(await showState(known), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    // The class only; never a row.
    console.error("show_state_failed", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "The database didn't answer" }, { status: 503 });
  }
}
