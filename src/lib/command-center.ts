import "server-only";
import { commandCenterAccess } from "./secrets";
import type { CardSnapshot } from "./types";

/**
 * The Command Center connector (anersi-fex/tkg-pocket-ai, POST /api/mcp): stateless JSON-RPC
 * with the owner's connector token. Command Center files each Pocket recording; the thoughts for
 * the team meeting land in its Team meeting folder (group "team"). This app reads that folder
 * (tkg_notebook) and, after the meeting, marks the cards it showed as done (tkg_move_card).
 * Nothing else in Command Center is touched.
 */

export class CommandCenterError extends Error {
  constructor(
    message: string,
    readonly kind: "not_connected" | "unauthorized" | "unreachable" | "tool",
  ) {
    super(message);
  }
}

export interface TeamCard {
  id: string;
  card: CardSnapshot;
}

let rpcId = 0;

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const access = await commandCenterAccess();
  if (!access) throw new CommandCenterError("Command Center isn't connected yet (Settings).", "not_connected");
  let res: Response;
  try {
    res = await fetch(access.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${access.token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new CommandCenterError("Command Center didn't answer.", "unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new CommandCenterError("Command Center refused the token.", "unauthorized");
  if (!res.ok) throw new CommandCenterError(`Command Center answered ${res.status}.`, "unreachable");
  let body: { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message?: string } };
  try {
    body = await res.json();
  } catch {
    throw new CommandCenterError("Command Center sent something unreadable.", "unreachable");
  }
  if (body.error) throw new CommandCenterError(`Command Center: ${String(body.error.message ?? "error").slice(0, 160)}`, "tool");
  const text = body.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (body.result?.isError) throw new CommandCenterError(`Command Center: ${text.slice(0, 160)}`, "tool");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown, max: number, count: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, max)).slice(0, count) : []);

/** The open cards in the Team meeting folder, newest first as Command Center lists them. */
export async function listTeamCards(): Promise<TeamCard[]> {
  const out = await callTool("tkg_notebook", { group: "team", status: "open", limit: 100 });
  const notes = (out && typeof out === "object" && Array.isArray((out as { notes?: unknown }).notes) ? (out as { notes: unknown[] }).notes : []) as Record<string, unknown>[];
  return notes
    .filter((n) => typeof n.id === "string" && n.id.length > 0 && n.id.length <= 80)
    .map((n) => ({
      id: n.id as string,
      card: {
        title: str(n.title, 200),
        summary: str(n.summary, 2000),
        points: strs(n.points, 600, 20),
        people: strs(n.people, 80, 20),
        said_at: typeof n.last_said_at === "string" ? n.last_said_at : null,
        open: true,
      },
    }));
}

/** Marks one card done in Command Center (after the meeting showed it). */
export async function markCardDone(cardId: string): Promise<void> {
  const out = await callTool("tkg_move_card", { id: cardId, status: "done" });
  if (out && typeof out === "object" && "error" in out && (out as { error?: unknown }).error) {
    throw new CommandCenterError(`Command Center: ${String((out as { error: unknown }).error).slice(0, 160)}`, "tool");
  }
}

/** A quick check for Settings: how many open cards the folder holds. */
export async function testCommandCenter(): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  try {
    const cards = await listTeamCards();
    return { ok: true, count: cards.length };
  } catch (err) {
    return { ok: false, message: err instanceof CommandCenterError ? err.message : "Command Center didn't answer." };
  }
}
