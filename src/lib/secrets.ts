import "server-only";
import { getSetting, setSetting } from "./data";
import { dbConfigured } from "./supabase";

/**
 * The keys the app needs besides its own: the Command Center connector (address and token), a
 * Claude API key and a Pocket API key. An environment variable wins when set (Vercel); otherwise the owner
 * pastes them in Settings and they live in mtg_settings row "secrets", which only server code
 * reads (RLS on, no grants). Values never go back to the browser, into logs or into errors.
 */

import { DEFAULT_CC_URL } from "./checks";
export { DEFAULT_CC_URL };

interface StoredSecrets {
  cc_url?: string;
  cc_token?: string;
  anthropic_key?: string;
  pocket_key?: string;
}

async function stored(): Promise<StoredSecrets> {
  if (!dbConfigured()) return {};
  try {
    return (await getSetting<StoredSecrets>("secrets")) ?? {};
  } catch {
    return {};
  }
}

export interface CommandCenterAccess {
  url: string;
  token: string;
  source: "env" | "settings";
}

export async function commandCenterAccess(): Promise<CommandCenterAccess | null> {
  const envToken = process.env.COMMAND_CENTER_TOKEN?.trim();
  if (envToken) return { url: (process.env.COMMAND_CENTER_URL?.trim() || DEFAULT_CC_URL), token: envToken, source: "env" };
  const s = await stored();
  if (s.cc_token) return { url: s.cc_url || DEFAULT_CC_URL, token: s.cc_token, source: "settings" };
  return null;
}

export async function anthropicKey(): Promise<{ key: string; source: "env" | "settings" } | null> {
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  const s = await stored();
  return s.anthropic_key ? { key: s.anthropic_key, source: "settings" } : null;
}

export async function pocketKey(): Promise<{ key: string; source: "env" | "settings" } | null> {
  const env = process.env.POCKET_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  const s = await stored();
  return s.pocket_key ? { key: s.pocket_key, source: "settings" } : null;
}

export async function savePocketKey(key: string): Promise<void> {
  const s = await stored();
  await setSetting("secrets", { ...s, pocket_key: key });
}

export async function saveCommandCenter(url: string, token: string): Promise<void> {
  const s = await stored();
  await setSetting("secrets", { ...s, cc_url: url, cc_token: token });
}

export async function saveAnthropicKey(key: string): Promise<void> {
  const s = await stored();
  await setSetting("secrets", { ...s, anthropic_key: key });
}

export async function forget(which: "cc" | "anthropic" | "pocket"): Promise<void> {
  const s = await stored();
  const next: StoredSecrets = { ...s };
  if (which === "cc") {
    delete next.cc_url;
    delete next.cc_token;
  } else if (which === "pocket") delete next.pocket_key;
  else delete next.anthropic_key;
  await setSetting("secrets", next);
}
