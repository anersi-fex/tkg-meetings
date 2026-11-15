import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "./data";
import { readPastedAddress } from "./dialrush-types";
import type { DialStats } from "./dialrush-types";
export type { DialStats };

/**
 * DialRush (the team's dialer), read through its MCP server (https://dialrush.com/mcp) with the
 * owner's own DialRush sign-in. DialRush's OAuth registration accepts only Claude's own callback
 * or a loopback address ("Only Claude's own callback or a loopback address", 2026-11-15), so the
 * app registers a loopback callback (LOOPBACK, where nothing answers) and uses the paste flow
 * native apps use (RFC 8252): he signs in to DialRush and taps Approve, his browser lands on a
 * page that does not load, and he pastes that page's address back into Settings. The address
 * holds a one-time code bound to this app's PKCE verifier; the server trades it for tokens and
 * refreshes them on its own. Everything lives in mtg_settings "dialrush" (server only, never
 * sent to the browser, never logged). A live DialRush key (DIALRUSH_KEY, or a stored `key`) is
 * used instead when present. DIALRUSH_BASE points the tests at a stand-in.
 */

const BASE = (process.env.DIALRUSH_BASE?.trim() || "https://dialrush.com").replace(/\/$/, "");
const RESOURCE = `${BASE}/mcp`;
const KEY = "dialrush";
/** Where DialRush sends the browser after Approve: nothing listens there, the address is the point. */
export const LOOPBACK = "http://127.0.0.1:47812/dialrush";
/** A sign-in started more than this long ago is not finished. */
const PENDING_MS = 20 * 60_000;

interface Stored {
  /** A live DialRush key: sent as the bearer token. */
  key?: string;
  client_id?: string;
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
  if (!m?.authorization_endpoint || !m.token_endpoint) throw new DialRushError("DialRush didn't answer. Try again in a moment.", "unreachable");
  meta = { at: Date.now(), m };
  return m;
}

export async function dialRushConnected(): Promise<boolean> {
  if (process.env.DIALRUSH_KEY?.trim()) return true;
  const s = await read().catch(() => ({}) as Stored);
  return !!s.key || !!s.refresh_token || !!s.access_token;
}

/** Step 1: the DialRush sign-in page to open (registers this app with DialRush the first time). */
export async function startDialRushSignIn(): Promise<string> {
  const m = await metadata();
  const s = await read();
  let clientId = s.client_id;
  if (!clientId) {
    if (!m.registration_endpoint) throw new DialRushError("DialRush doesn't let apps register.", "unreachable");
    const res = await fetch(m.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "TKG Meetings", redirect_uris: [LOOPBACK], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as { client_id?: string; error?: string } | null) : null;
    if (!res?.ok || !body?.client_id) {
      console.error("dialrush_register_failed", res?.status ?? "no_answer", String(body?.error ?? "").slice(0, 40));
      throw new DialRushError("DialRush refused to register the app.", "unreachable");
    }
    clientId = body.client_id;
  }
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  await setSetting(KEY, { ...s, client_id: clientId, pending: { state, verifier, at: Date.now() } });
  const u = new URL(m.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", LOOPBACK);
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

type Tokens = Pick<Stored, "access_token" | "refresh_token" | "expires_at">;
async function tokenRequest(form: Record<string, string>): Promise<Tokens> {
  const m = await metadata();
  const res = await fetch(m.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new DialRushError("DialRush didn't answer. Try again in a moment.", "unreachable");
  const body = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !body?.access_token) {
    console.error("dialrush_token_failed", res.status, String(body?.error ?? "").slice(0, 40));
    throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 };
}

/** Step 2: the address he landed on after Approve becomes the app's tokens. */
export async function finishDialRushSignIn(pasted: string): Promise<void> {
  const got = readPastedAddress(pasted);
  if (!got) throw new DialRushError("That address has no sign-in code. Copy the whole address of the page DialRush opened.", "signed_out");
  if ("denied" in got) throw new DialRushError("DialRush says the sign-in was declined. Start again and tap Approve.", "signed_out");
  const s = await read();
  const p = s.pending;
  if (!p || !s.client_id || Date.now() - p.at > PENDING_MS) throw new DialRushError("That sign-in expired. Tap Sign in to DialRush again.", "signed_out");
  if (!sameText(p.state, got.state)) throw new DialRushError("That address is from an older sign-in. Use the newest one.", "signed_out");
  let t: Tokens;
  try {
    t = await tokenRequest({ grant_type: "authorization_code", code: got.code, redirect_uri: LOOPBACK, client_id: s.client_id, code_verifier: p.verifier, resource: RESOURCE });
  } catch (err) {
    if (err instanceof DialRushError && err.kind === "signed_out") throw new DialRushError("DialRush didn't accept that code (it may have expired). Tap Sign in to DialRush again and paste the new address right away.", "signed_out");
    throw err;
  }
  await setSetting(KEY, { client_id: s.client_id, ...t });
}

export async function disconnectDialRush(): Promise<void> {
  const s = await read().catch(() => ({}) as Stored);
  // The app's registration with DialRush stays: signing in again does not register it again.
  await setSetting(KEY, s.client_id ? { client_id: s.client_id } : {});
}

/** One refresh at a time in this server: two reads at once must not both spend a single-use refresh token. */
let refreshing: Promise<string> | null = null;

async function accessToken(force = false): Promise<string> {
  const env = process.env.DIALRUSH_KEY?.trim();
  if (env) return env;
  const s = await read();
  if (s.key) return s.key;
  if (!s.access_token && !s.refresh_token) throw new DialRushError("DialRush isn't connected yet.", "not_connected");
  if (!force && s.access_token && (s.expires_at ?? 0) > Date.now() + 60_000) return s.access_token;
  if (!s.refresh_token || !s.client_id) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  refreshing ??= (async () => {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh_token!, client_id: s.client_id!, resource: RESOURCE });
      await setSetting(KEY, { client_id: s.client_id, ...t, refresh_token: t.refresh_token ?? s.refresh_token });
      return t.access_token!;
    } catch (err) {
      // Another server may have refreshed first (a rotated token is spent): use what it saved.
      const now = await read().catch(() => ({}) as Stored);
      if (now.access_token && now.access_token !== s.access_token && (now.expires_at ?? 0) > Date.now()) return now.access_token;
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
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

/** MCP tool calls in one session (initialize, initialized, then each call), refreshing once if the token was refused. */
async function callTools(calls: Array<{ name: string; args: Record<string, unknown> }>, retried = false): Promise<unknown[]> {
  const token = await accessToken(retried);
  const initId = ++rpcId;
  const init = await post(token, null, { jsonrpc: "2.0", id: initId, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "TKG Meetings", version: "1" } } });
  if ((init.status === 401 || init.status === 403) && !retried) return callTools(calls, true);
  if (init.status === 401 || init.status === 403) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
  if (!init.ok) throw new DialRushError(`DialRush answered ${init.status}.`, "unreachable");
  const session = init.headers.get("mcp-session-id");
  await rpcBody(init, initId);
  await post(token, session, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => null);
  const out: unknown[] = [];
  for (const c of calls) {
    const id = ++rpcId;
    const res = await post(token, session, { jsonrpc: "2.0", id, method: "tools/call", params: { name: c.name, arguments: c.args } });
    if ((res.status === 401 || res.status === 403) && !retried) return callTools(calls, true);
    if (res.status === 401 || res.status === 403) throw new DialRushError("DialRush asked to sign in again.", "signed_out");
    if (!res.ok) throw new DialRushError(`DialRush answered ${res.status}.`, "unreachable");
    const body = await rpcBody(res, id);
    const result = body?.result as { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown } | undefined;
    if (!result || result.isError) throw new DialRushError("DialRush couldn't read that.", "tool");
    if (result.structuredContent) {
      out.push(result.structuredContent);
      continue;
    }
    const text = (result.content ?? []).find((x) => x.type === "text")?.text ?? "";
    try {
      out.push(JSON.parse(text));
    } catch {
      throw new DialRushError("DialRush sent something unreadable.", "tool");
    }
  }
  return out;
}

type When = "today" | "7d" | { day: string };

function toStats(raw: unknown): DialStats {
  const r = (raw ?? {}) as { team?: Record<string, unknown>; dispositions?: Array<{ dispositionName?: string; count?: number }> };
  const t = r.team ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const appointments = (r.dispositions ?? []).filter((d) => /appointment/i.test(d.dispositionName ?? "")).reduce((s, d) => s + n(d.count), 0);
  return { dials: n(t.dials), connects: n(t.connects), appointments, talkSeconds: n(t.talkSeconds) };
}

/** His numbers for each of these days or ranges ("today", "7d", or one date YYYY-MM-DD), in one DialRush session. */
export async function dialStatsMany(whens: When[]): Promise<DialStats[]> {
  const raws = await callTools(whens.map((w) => ({ name: "get_stats", args: typeof w === "string" ? { range: w } : { startDate: w.day, endDate: w.day } })));
  return raws.map(toStats);
}

export async function dialStats(when: When): Promise<DialStats> {
  return (await dialStatsMany([when]))[0];
}
