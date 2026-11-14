import { NextResponse } from "next/server";
import { currentRole } from "@/lib/auth";
import { showState } from "@/lib/meeting";

export const dynamic = "force-dynamic";

/**
 * The live show for the TV and the clicker: which slide is on and how many there are. The deck
 * itself rides along only when the caller's copy (?k=, the deckKey it last got) is out of date, so
 * the TV's once-a-second poll stays tiny. Any signed-in viewer (the TV signs in with the team
 * password); the speaker notes go to the owner only.
 */
export async function GET(request: Request) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const k = new URL(request.url).searchParams.get("k");
  const known = k && k.length <= 80 ? k : null;
  try {
    return NextResponse.json(await showState(known, { withNotes: role === "owner" }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    // The class only; never a row.
    console.error("show_state_failed", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "The database didn't answer" }, { status: 503 });
  }
}
