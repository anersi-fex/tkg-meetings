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
import { setSetting } from "@/lib/data";
import { cleanToday } from "@/lib/today-plan";
import { DialRushError, dialStats, disconnectDialRush as forgetDialRush, finishDialRushSignIn } from "@/lib/dialrush";

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

/** Today's goal (connections a day) and his weekday dial blocks. */
export async function saveToday(input: { goal: number; blocks: Array<{ start: string; end: string }> }): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const goal = Math.round(Number(input?.goal));
  if (!(goal >= 1 && goal <= 1000)) return { ok: false, error: "The goal is a number from 1 to 1000." };
  const blocks = Array.isArray(input?.blocks) ? input.blocks.slice(0, 4) : [];
  const clean = cleanToday({ goal, blocks });
  if (clean.blocks.length !== blocks.length) return { ok: false, error: "Each block has to start before it ends." };
  try {
    await setSetting("today", clean);
    revalidatePath("/today");
    revalidatePath("/settings");
    return { ok: true, message: "Saved." };
  } catch {
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
}

/** Step 2 of connecting DialRush: the address the browser landed on after Approve. */
export async function connectDialRush(pasted: string): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  const text = String(pasted ?? "").trim();
  if (!text) return { ok: false, error: "Paste the address of the page DialRush opened." };
  try {
    await finishDialRushSignIn(text);
  } catch (err) {
    return { ok: false, error: err instanceof DialRushError ? err.message : "That didn't work. Try again in a moment." };
  }
  revalidatePath("/today");
  revalidatePath("/settings");
  try {
    const today = await dialStats("today");
    return { ok: true, message: `DialRush is connected. ${today.connects} connection${today.connects === 1 ? "" : "s"} today.` };
  } catch {
    return { ok: true, message: "DialRush is connected." };
  }
}

export async function disconnectDialRush(): Promise<ActionResult> {
  const denied = await ownerOnly();
  if (denied) return denied;
  try {
    await forgetDialRush();
    revalidatePath("/today");
    revalidatePath("/settings");
    return { ok: true, message: "DialRush disconnected." };
  } catch {
    return { ok: false, error: "That didn't work. Try again in a moment." };
  }
}
