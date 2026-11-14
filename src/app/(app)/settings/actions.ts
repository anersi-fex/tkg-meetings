"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { forget, saveAnthropicKey, saveCommandCenter, savePocketKey } from "@/lib/secrets";
import { testPocket } from "@/lib/pocket";
import { parseConnector } from "@/lib/checks";
import { testCommandCenter } from "@/lib/command-center";
import { draftPending, testClaude } from "@/lib/draft";
import { getOpenMeeting, requeueFailedDrafts } from "@/lib/data";
import { after } from "next/server";
import type { ActionResult } from "../actions";

/**
 * Settings: the owner pastes the Command Center connector and a Claude key. Each is tested before
 * it is kept; nothing pasted is ever sent back to the browser.
 */

async function ownerOnly(): Promise<ActionResult | null> {
  try {
    await requireRole("owner");
    return null;
  } catch {
    return { ok: false, error: "Sign in again to do that." };
  }
}

export async function connectCommandCenter(input: string): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const parsed = parseConnector(String(input ?? ""));
  if (!parsed) return { ok: false, error: "Paste the connector address (it has “token=” in it) or the token itself." };
  try {
    await saveCommandCenter(parsed.url, parsed.token);
    const test = await testCommandCenter();
    revalidatePath("/settings");
    revalidatePath("/");
    if (!test.ok) return { ok: false, error: `Saved, but: ${test.message}` };
    return { ok: true, message: `Connected. ${test.count} ${test.count === 1 ? "thought is" : "thoughts are"} in the Team meeting folder.` };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

export async function connectClaude(input: string): Promise<ActionResult> {
  // The drafts this starts count their time from here: the key's test comes out of the same 300 s.
  const startedAt = Date.now();
  const denied = await ownerOnly();
  if (denied) return denied;
  const key = String(input ?? "").trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key)) return { ok: false, error: "A Claude key starts with “sk-ant-”. Copy it again from the Claude Console." };
  const test = await testClaude(key);
  if (!test.ok) return { ok: false, error: test.message };
  try {
    await saveAnthropicKey(key);
    // Thoughts that fell back to plain Key lines get drafted now (the owner's edits are kept).
    const open = await getOpenMeeting().catch(() => null);
    const redo = open ? await requeueFailedDrafts(open.id).catch(() => 0) : 0;
    if (open && redo) after(() => draftPending(open.id, { startedAt }).then(() => undefined, () => undefined));
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: redo ? `Claude is connected. Drafting ${redo} ${redo === 1 ? "slide" : "slides"} now.` : "Claude is connected." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

export async function connectPocket(input: string): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const key = String(input ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{16,300}$/.test(key)) return { ok: false, error: "Copy the key again from the Pocket app (Settings, Developer, API Keys). It starts with pk_." };
  const test = await testPocket(key);
  if (!test.ok) return { ok: false, error: test.message };
  try {
    await savePocketKey(key);
    revalidatePath("/settings");
    revalidatePath("/pocket");
    return { ok: true, message: `Pocket is connected. ${test.count} ${test.count === 1 ? "recording" : "recordings"} this week.` };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

export async function disconnect(which: "cc" | "anthropic" | "pocket"): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  if (which !== "cc" && which !== "anthropic" && which !== "pocket") return { ok: false, error: "Nothing to disconnect." };
  await forget(which);
  revalidatePath("/settings");
  if (which === "pocket") revalidatePath("/pocket");
  return { ok: true, message: "Disconnected." };
}
