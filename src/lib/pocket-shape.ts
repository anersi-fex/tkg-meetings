/**
 * Reading what Pocket's API returns (https://docs.heypocketai.com/docs/api), defensively: the
 * shapes vary by endpoint and have changed over time. Ported from Command Center's lib/pocket.ts
 * (anersi-fex/tkg-pocket-ai), which reads the same account. Pure and browser-safe, so it is
 * tested without a network.
 */

type Json = Record<string, unknown>;

const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export interface PocketRecording {
  id: string;
  title: string;
  /** ISO time it was recorded, or null. */
  recordedAt: string | null;
  durationSec: number | null;
  /** Pocket's own summary (plain text), "" when it has none yet. */
  summary: string;
  /** What he said, "" when the endpoint did not include it. */
  transcript: string;
}

/** Pocket transcripts arrive as a string, an array of segments, or {segments|utterances|text}. */
export function transcriptToText(t: unknown): string {
  if (typeof t === "string") return t.trim();
  const o = obj(t);
  if (o) {
    for (const key of ["segments", "utterances", "items"]) {
      if (Array.isArray(o[key])) return transcriptToText(o[key]);
    }
    return str(o.text) ?? str(o.content) ?? "";
  }
  if (Array.isArray(t)) {
    const lines: string[] = [];
    for (const seg of t) {
      const s = obj(seg);
      const text = s ? (str(s.text) ?? str(s.content) ?? str(s.transcript)) : null;
      if (text) lines.push(text);
    }
    return lines.join(" ").trim();
  }
  return "";
}

/** summarizations: { "<id>": { v2: { summary: { markdown | text | bulletPoints } } } }, or an array. */
function summaryFrom(summarizations: unknown): string | null {
  const entries = Array.isArray(summarizations) ? summarizations : Object.values(obj(summarizations) ?? {});
  for (const entry of entries) {
    const e = obj(entry);
    if (!e) continue;
    const v2 = obj(e.v2) ?? e;
    const s = obj(v2.summary);
    const text =
      str(s?.markdown) ??
      str(s?.text) ??
      (Array.isArray(s?.bulletPoints) ? (s.bulletPoints as unknown[]).filter((x) => typeof x === "string").join("\n") : null) ??
      str(v2.summary) ??
      str(e.markdown);
    if (text) return text;
  }
  return null;
}

/** Markdown summary to plain text: headings dropped ("## Summary" is not part of it), no bullets, emphasis or links, one space between words. */
export function plainSummary(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}(?:\s.*)?$/gm, "")
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** One recording from a list row or a GET /recordings/{id} body (optionally wrapped in {data}). */
export function readRecording(body: unknown): PocketRecording | null {
  const root = obj(body) ?? {};
  const data = obj(root.data) ?? root;
  const rec = obj(data.recording) ?? data;
  const id = str(rec.id) ?? str(data.recordingId) ?? str(data.recording_id);
  if (!id) return null;
  const transcript =
    transcriptToText(data.transcript) || transcriptToText(rec.transcript) || transcriptToText(rec.transcription) || transcriptToText(data.transcription);
  const summary = summaryFrom(data.summarizations ?? rec.summarizations ?? data.summaries ?? rec.summaries) ?? str(rec.description) ?? str(rec.summary) ?? "";
  const at = str(rec.recordedAt) ?? str(rec.recorded_at) ?? str(rec.createdAt) ?? str(rec.created_at) ?? str(rec.startedAt);
  const duration = num(rec.duration) ?? num(rec.durationSeconds) ?? num(rec.duration_seconds);
  return {
    id,
    title: str(rec.title) ?? str(rec.name) ?? "",
    recordedAt: at && !isNaN(new Date(at).getTime()) ? new Date(at).toISOString() : null,
    // Pocket reports seconds; a very large value is milliseconds.
    durationSec: duration == null ? null : Math.round(duration > 36000 ? duration / 1000 : duration),
    summary: plainSummary(summary),
    transcript,
  };
}

/** The recordings of a GET /recordings answer: data as a list, or {recordings} / {items}. */
export function readRecordingList(body: unknown): PocketRecording[] {
  const data = obj(body)?.data ?? body;
  const list = Array.isArray(data) ? data : Array.isArray(obj(data)?.recordings) ? (obj(data)!.recordings as unknown[]) : Array.isArray(obj(data)?.items) ? (obj(data)!.items as unknown[]) : [];
  return list.map(readRecording).filter((r): r is PocketRecording => !!r);
}

/** The id a Pocket recording's thought has in a meeting (mtg_items.card_id). */
export const POCKET_PREFIX = "pocket:";
export const isPocketCard = (cardId: string) => cardId.startsWith(POCKET_PREFIX);
