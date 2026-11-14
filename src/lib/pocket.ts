import "server-only";
import { pocketKey } from "./secrets";
import { readRecording, readRecordingList, type PocketRecording } from "./pocket-shape";

/**
 * Pocket's public API with the owner's own key (Settings, or POCKET_API_KEY). Meetings only reads:
 * his recent recordings (for the Pocket screen) and one recording in full when he taps "Make a
 * meeting". Errors carry a kind and plain words, never the key or a response body.
 */

const API_BASE = (process.env.POCKET_API_BASE?.trim() || "https://public.heypocketai.com/api/v1/public").replace(/\/$/, "");

export class PocketError extends Error {
  constructor(
    message: string,
    readonly kind: "not_connected" | "unauthorized" | "unreachable",
  ) {
    super(message);
  }
}

async function call(path: string, key: string, timeoutMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new PocketError("Pocket didn't answer.", "unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new PocketError("Pocket refused the key.", "unauthorized");
  if (!res.ok) throw new PocketError(`Pocket answered ${res.status}.`, "unreachable");
  try {
    return await res.json();
  } catch {
    throw new PocketError("Pocket sent something unreadable.", "unreachable");
  }
}

async function keyOrThrow(): Promise<string> {
  const k = await pocketKey();
  if (!k) throw new PocketError("Pocket isn't connected yet (Settings).", "not_connected");
  return k.key;
}

/** His recordings from the last `days` days, newest first (Pocket's list: titles, times, maybe summaries). */
export async function listRecentRecordings(days = 7, key?: string): Promise<PocketRecording[]> {
  const k = key ?? (await keyOrThrow());
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const list = readRecordingList(await call(`/recordings?start_date=${start}&limit=50`, k, 15_000));
  return list.sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""));
}

/** One recording in full: Pocket's summary and the transcript. */
export async function fetchRecording(id: string): Promise<PocketRecording> {
  const k = await keyOrThrow();
  const rec = readRecording(await call(`/recordings/${encodeURIComponent(id)}?include_transcript=true&include_summarizations=true`, k, 15_000), id);
  if (!rec) throw new PocketError("Pocket didn't send that recording.", "unreachable");
  return rec;
}

/** Settings: does this key open his recordings? */
export async function testPocket(key: string): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  try {
    const list = await listRecentRecordings(7, key);
    return { ok: true, count: list.length };
  } catch (err) {
    return { ok: false, message: err instanceof PocketError ? err.message : "Pocket didn't answer." };
  }
}
