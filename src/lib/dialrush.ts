import "server-only";
import { getSetting, setSetting } from "./data";

/**
 * DialRush (the team's dialer), read through its MCP server (https://dialrush.com/mcp) with a
 * live DialRush key he pastes in Settings (mtg_settings "dialrush", server only, never sent to
 * the browser, never logged), or DIALRUSH_KEY. DialRush's sign-in (OAuth) is open only to
 * Claude's own connector: its registration refuses any other callback ("Only Claude's own
 * callback or a loopback address", 2026-11-15), so an app needs the key. The app reads his
 * stats with the MCP tool get_stats. DIALRUSH_BASE points the tests at a stand-in.
 */

const BASE = (process.env.DIALRUSH_BASE?.trim() || "https://dialrush.com").replace(/\/$/, "");
const RESOURCE = `${BASE}/mcp`;
const KEY = "dialrush";

interface Stored {
  /** A live DialRush key: sent as the bearer token. */
  key?: string;
}

export class DialRushError extends Error {
  constructor(
    message: string,
    readonly kind: "not_connected" | "signed_out" | "unreachable" | "tool",
  ) {
    super(message);
  }
}

const read = async () => (await getSetting<Stored>(KEY)) ?? {};

export async function dialRushConnected(): Promise<boolean> {
  if (process.env.DIALRUSH_KEY?.trim()) return true;
  const s = await read().catch(() => ({}) as Stored);
  return !!s.key;
}

/** Saves a live DialRush key after one real read with it works. */
export async function saveDialRushKey(key: string): Promise<{ ok: true; connects: number } | { ok: false; message: string }> {
  try {
    const stats = await dialStats("today", key);
    await setSetting(KEY, { key });
    return { ok: true, connects: stats.connects };
  } catch (err) {
    return { ok: false, message: err instanceof DialRushError ? err.message : "DialRush didn't answer." };
  }
}

export async function disconnectDialRush(): Promise<void> {
  await setSetting(KEY, {});
}

async function storedKey(): Promise<string> {
  const env = process.env.DIALRUSH_KEY?.trim();
  if (env) return env;
  const s = await read();
  if (!s.key) throw new DialRushError("DialRush isn't connected yet.", "not_connected");
  return s.key;
}

/** A JSON-RPC answer, sent as JSON or as a server-sent event stream. */
async function rpcBody(res: Response, id: number): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try {
        const o = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        if (o.id === id) return o;
      } catch {
        /* not JSON */
      }
    }
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

let rpcId = 0;
async function post(token: string, session: string | null, msg: Record<string, unknown>): Promise<Response> {
  const res = await fetch(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "mcp-protocol-version": "2025-06-18",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify(msg),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) throw new DialRushError("DialRush didn't answer.", "unreachable");
  return res;
}

/** One MCP tool call: initialize, initialized, then tools/call. */
async function callTool(name: string, args: Record<string, unknown>, key?: string): Promise<unknown> {
  const token = key ?? (await storedKey());
  const initId = ++rpcId;
  const init = await post(token, null, { jsonrpc: "2.0", id: initId, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "TKG Meetings", version: "1" } } });
  if (init.status === 401 || init.status === 403) throw new DialRushError("DialRush refused the key.", "signed_out");
  if (!init.ok) throw new DialRushError(`DialRush answered ${init.status}.`, "unreachable");
  const session = init.headers.get("mcp-session-id");
  await rpcBody(init, initId);
  await post(token, session, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => null);
  const id = ++rpcId;
  const res = await post(token, session, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  if (res.status === 401 || res.status === 403) throw new DialRushError("DialRush refused the key.", "signed_out");
  if (!res.ok) throw new DialRushError(`DialRush answered ${res.status}.`, "unreachable");
  const body = await rpcBody(res, id);
  const result = body?.result as { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown } | undefined;
  if (!result || result.isError) throw new DialRushError("DialRush couldn't read that.", "tool");
  if (result.structuredContent) return result.structuredContent;
  const text = (result.content ?? []).find((c) => c.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new DialRushError("DialRush sent something unreadable.", "tool");
  }
}

import type { DialStats } from "./dialrush-types";
export type { DialStats };

/** His numbers for a day or a range ("today", "7d", or one date YYYY-MM-DD). */
export async function dialStats(when: "today" | "7d" | { day: string }, key?: string): Promise<DialStats> {
  const args = typeof when === "string" ? { range: when } : { startDate: when.day, endDate: when.day };
  const raw = (await callTool("get_stats", args, key)) as { team?: Record<string, unknown>; dispositions?: Array<{ dispositionName?: string; count?: number }> } | null;
  const t = raw?.team ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const appointments = (raw?.dispositions ?? []).filter((d) => /appointment/i.test(d.dispositionName ?? "")).reduce((s, d) => s + n(d.count), 0);
  return { dials: n(t.dials), connects: n(t.connects), appointments, talkSeconds: n(t.talkSeconds) };
}
