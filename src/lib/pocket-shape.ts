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

/**
 * Pocket transcripts arrive as a string, an array of segments, or {segments|utterances|text}. A new
 * speaker starts a new line ("Speaker 2: …"), as in Command Center's reader, so Claude can tell
 * his words from anyone else's.
 */
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
    let lastSpeaker: string | null = null;
    for (const seg of t) {
      const s = obj(seg);
      if (!s) continue;
      const text = str(s.text) ?? str(s.content) ?? str(s.transcript);
      if (!text) continue;
      const speaker = str(s.speaker) ?? str(s.speakerName) ?? str(s.speaker_name) ?? str(obj(s.speaker)?.name);
      if (speaker && speaker !== lastSpeaker) {
        lines.push(`\n${speaker}: ${text}`);
        lastSpeaker = speaker;
      } else lines.push(text);
    }
    return lines.join(" ").replace(/ \n/g, "\n").trim();
  }
  return "";
}

/** At most `n` UTF-16 units, never ending inside an emoji (a lone surrogate fails the database's JSON). */
export function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  const out = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}

/** A recording id this app will put in a Pocket address: letters, digits and . _ : -, not starting with a dot. */
export const isRecordingId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,71}$/.test(id);

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

const idOf = (v: unknown): string | null => str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : null);

/**
 * One recording from a list row or a GET /recordings/{id} body (optionally wrapped in {data}).
 * `knownId` is the id asked for, used when the body does not repeat it.
 */
export function readRecording(body: unknown, knownId?: string): PocketRecording | null {
  const root = obj(body) ?? {};
  const data = obj(root.data) ?? root;
  const rec = obj(data.recording) ?? data;
  const id = idOf(rec.id) ?? idOf(data.recordingId) ?? idOf(data.recording_id) ?? knownId ?? null;
  if (!id) return null;
  const transcript =
    transcriptToText(data.transcript) || transcriptToText(rec.transcript) || transcriptToText(rec.transcription) || transcriptToText(data.transcription);
  const summary = summaryFrom(data.summarizations ?? rec.summarizations ?? data.summaries ?? rec.summaries) ?? str(rec.description) ?? str(rec.summary) ?? "";
  // The same order as Command Center's reader, whose cards carry this time as said_at.
  const at = str(rec.createdAt) ?? str(rec.created_at) ?? str(rec.recordedAt) ?? str(rec.recorded_at) ?? str(rec.startedAt);
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
  return list.map((r) => readRecording(r)).filter((r): r is PocketRecording => !!r);
}

/** The id a Pocket recording's thought has in a meeting (mtg_items.card_id). */
export const POCKET_PREFIX = "pocket:";
export const isPocketCard = (cardId: string) => cardId.startsWith(POCKET_PREFIX);

/** Two times within two minutes: Command Center's card and a Pocket recording are the same moment. */
export function sameMoment(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const d = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Number.isFinite(d) && d <= 120_000;
}

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", weekday: "short" });
const DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", minute: "2-digit" });

/** "Today 3:14 PM · 3 min", "Yesterday …", "Wed …" within the week, else "Nov 7 …" (Detroit time). */
export function whenLabel(recordedAt: string | null, durationSec: number | null, now: Date): string {
  const parts: string[] = [];
  if (recordedAt) {
    const at = new Date(recordedAt);
    const days = Math.round((Date.parse(DAY.format(now)) - Date.parse(DAY.format(at))) / 86_400_000);
    const day = days === 0 ? "Today" : days === 1 ? "Yesterday" : days > 1 && days < 7 ? WEEKDAY.format(at) : DATE.format(at);
    parts.push(`${day} ${TIME.format(at)}`);
  }
  if (durationSec != null) parts.push(durationSec < 60 ? "under 1 min" : `${Math.round(durationSec / 60)} min`);
  return parts.join(" · ");
}
