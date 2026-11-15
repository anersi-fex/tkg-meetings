import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./data";

/**
 * DialRush (the team's dialer), read with the owner's own sign-in, the way Claude's connector
 * does it: OAuth 2.1 with dynamic client registration and PKCE against DialRush's MCP server
 * (https://dialrush.com/mcp; metadata at /.well-known/oauth-authorization-server). He taps
 * Connect DialRush, signs in to DialRush and approves; the tokens live in mtg_settings
 * ("dialrush", server only, never sent to the browser, never logged). The app reads his stats
 * with the MCP tool get_stats. DIALRUSH_BASE points the tests at a stand-in.
 */

const BASE = (process.env.DIALRUSH_BASE?.trim() || "https://dialrush.com").replace(/\/$/, "");
const RESOURCE = `${BASE}/mcp`;
const KEY = "dialrush";
/** A sign-in started more than this long ago is not finished. */
const PENDING_MS = 15 * 60_000;

interface Stored {
  client_id?: string;
  redirect_uri?: string;
  access_token?: string;
  refresh_token?: string;
  /** epoch ms */
  expires_at?: number;
  pending?: { state: string; verifier: string; at: number };
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
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Meta = { authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string };
let meta: { at: number; m: Meta } | null = null;
async function metadata(): Promise<Meta> {
  if (meta && Date.now() - meta.at < 3_600_000) return meta.m;
  const res = await fetch(`${BASE}/.well-known/oauth-authorization-server`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const m = res?.ok ? ((await res.json().catch(() => null)) as Meta | null) : null;
  if (!m?.authorization_endpoint || !m.token_endpoint) throw new DialRushError("DialRush didn't answer.", "unreachable");
  meta = { at: Date.now(), m };
  return m;
}

export async function dialRushConnected(): Promise<boolean> {
  const s = await read().catch(() => ({}) as Stored);
  return !!s.refresh_token || !!s.access_token;
}

/** The DialRush sign-in page to send him to (registers this app with DialRush the first time). */
export async function startDialRushConnect(base: string): Promise<string> {
  const m = await metadata();
  const s = await read();
  const redirect = `${base}/api/dialrush/callback`;
  let clientId = s.redirect_uri === redirect ? s.client_id : undefined;
  if (!clientId) {
    if (!m.registration_endpoint) throw new DialRushError("DialRush doesn't let apps register.", "unreachable");
    const res = await fetch(m.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "TKG Meetings", redirect_uris: [redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { client_id?: string } | null) : null;
    if (!body?.client_id) throw new DialRushError("DialRush refused to register the app.", "unreachable");
    clientId = body.client_id;
  }
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  await setSetting(KEY, { ...s, client_id: clientId, redirect_uri: redirect, pending: { state, verifier, at: Date.now() } });
  const u = new URL(m.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", RESOURCE);
  return u.toString();
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function tokenRequest(form: Record<string, string>): Promise<Stored> {
  const m = await metadata();
  const res = await fetch(m.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new DialRushError("DialRush didn't answer.", "unreachable");
  const body = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 };
}

/** Finishes the sign-in DialRush sent him back from. */
export async function finishDialRushConnect(code: string, state: string): Promise<void> {
  const s = await read();
  const p = s.pending;
  if (!p || Date.now() - p.at > PENDING_MS || !sameText(p.state, state) || !s.client_id || !s.redirect_uri) throw new DialRushError("That sign-in expired. Tap Connect DialRush again.", "signed_out");
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: s.redirect_uri, client_id: s.client_id, code_verifier: p.verifier, resource: RESOURCE });
  await setSetting(KEY, { client_id: s.client_id, redirect_uri: s.redirect_uri, ...t, refresh_token: t.refresh_token ?? s.refresh_token });
}

export async function disconnectDialRush(): Promise<void> {
  const s = await read();
  await setSetting(KEY, { client_id: s.client_id, redirect_uri: s.redirect_uri });
}

async function accessToken(force = false): Promise<string> {
  const s = await read();
  if (!s.access_token && !s.refresh_token) throw new DialRushError("DialRush isn't connected yet.", "not_connected");
  if (!force && s.access_token && (s.expires_at ?? 0) > Date.now() + 60_000) return s.access_token;
  if (!s.refresh_token || !s.client_id) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh_token, client_id: s.client_id, resource: RESOURCE });
  await setSetting(KEY, { ...s, ...t, refresh_token: t.refresh_token ?? s.refresh_token });
  return t.access_token!;
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

/** One MCP tool call (initialize, initialized, tools/call), signing in again once if the token was refused. */
async function callTool(name: string, args: Record<string, unknown>, retried = false): Promise<unknown> {
  const token = await accessToken(retried);
  const initId = ++rpcId;
  const init = await post(token, null, { jsonrpc: "2.0", id: initId, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "TKG Meetings", version: "1" } } });
  if (init.status === 401 && !retried) return callTool(name, args, true);
  if (init.status === 401) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  if (!init.ok) throw new DialRushError(`DialRush answered ${init.status}.`, "unreachable");
  const session = init.headers.get("mcp-session-id");
  await rpcBody(init, initId);
  await post(token, session, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => null);
  const id = ++rpcId;
  const res = await post(token, session, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  if (res.status === 401 && !retried) return callTool(name, args, true);
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
export async function dialStats(when: "today" | "7d" | { day: string }): Promise<DialStats> {
  const args = typeof when === "string" ? { range: when } : { startDate: when.day, endDate: when.day };
  const raw = (await callTool("get_stats", args)) as { team?: Record<string, unknown>; dispositions?: Array<{ dispositionName?: string; count?: number }> } | null;
  const t = raw?.team ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const appointments = (raw?.dispositions ?? []).filter((d) => /appointment/i.test(d.dispositionName ?? "")).reduce((s, d) => s + n(d.count), 0);
  return { dials: n(t.dials), connects: n(t.connects), appointments, talkSeconds: n(t.talkSeconds) };
}
