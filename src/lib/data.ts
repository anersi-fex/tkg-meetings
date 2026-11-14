import "server-only";
import { db } from "./supabase";
import { cleanSlide, type ContentSlide, type DrawnSlide } from "./slides";
import type { CardSnapshot, DraftStatus, Item, Meeting, MeetingStatus, ScoreboardMonth } from "./types";

/**
 * Every read and write, with the service key, after the caller checked the session. Errors name
 * the table and the operation only, never a row (rows hold the owner's own thoughts).
 */

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

const MEETING_COLS = "id,status,meets_on,title,cover_line,scoreboard,scoreboard_month,quote,deck,deck_version,current_slide,shown_items,started_at,ended_at,created_at,updated_at";
const MEETING_LIST_COLS = "id,status,meets_on,title,cover_line,scoreboard,scoreboard_month,quote,deck_version,current_slide,shown_items,started_at,ended_at,created_at,updated_at";
const ITEM_COLS = "id,meeting_id,card_id,card,included,position,section,slides,quote_candidates,draft_status,draft_note,done_in_cc,off_by_app,created_at,updated_at";

type MeetingRow = Omit<Meeting, "deck" | "shown_items"> & { deck?: unknown; shown_items?: unknown };

function toMeeting(r: MeetingRow): Meeting {
  const q = r.quote as { text?: unknown; name?: unknown } | null;
  return {
    ...r,
    scoreboard_month: (["auto", "this", "last"].includes(r.scoreboard_month) ? r.scoreboard_month : "auto") as ScoreboardMonth,
    quote: q && typeof q.text === "string" && q.text.trim() ? { text: q.text, name: typeof q.name === "string" && q.name ? q.name : "Anersi Koka" } : null,
    deck: Array.isArray(r.deck) ? (r.deck as DrawnSlide[]) : null,
    shown_items: Array.isArray(r.shown_items) ? r.shown_items.filter((x): x is string => typeof x === "string") : [],
  };
}

export function toCard(v: unknown): CardSnapshot {
  const o = (v ?? {}) as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    title: typeof o.title === "string" ? o.title : "",
    summary: typeof o.summary === "string" ? o.summary : "",
    points: strings(o.points),
    people: strings(o.people),
    said_at: typeof o.said_at === "string" ? o.said_at : null,
    open: o.open !== false,
    ...(typeof o.transcript === "string" && o.transcript ? { transcript: o.transcript.slice(0, TRANSCRIPT_MAX) } : {}),
  };
}

/** A Pocket transcript kept on a thought for drafting, at most this many characters. */
export const TRANSCRIPT_MAX = 12_000;

/**
 * The note a thought the app switched off carries (it came in after the show started): shown with
 * it, ahead of any other note, for as long as it stays off that way. It is not stored, so a draft
 * that finishes later never wipes it, and it goes away the moment he switches the thought on.
 */
export const CAME_IN_NOTE = "Came in during the meeting: switch it on to show it.";

/** The note as shown: the came-in note first while the app keeps the thought off. Pure. */
export function shownNote(stored: string | null, offByApp: boolean): string | null {
  if (!offByApp) return stored;
  const own = storedNote(stored);
  return own ? `${CAME_IN_NOTE} ${own}` : CAME_IN_NOTE;
}

/** The note without the came-in part (what is stored or carried into the next meeting). Pure. */
export function storedNote(note: string | null): string | null {
  if (!note?.startsWith(CAME_IN_NOTE)) return note || null;
  return note.slice(CAME_IN_NOTE.length).trim() || null;
}

function toItem(r: Record<string, unknown>): Item {
  const slides: ContentSlide[] = [];
  for (const s of Array.isArray(r.slides) ? r.slides : []) {
    try {
      slides.push(cleanSlide(s));
    } catch {
      /* a slide of a layout this release does not know: skipped */
    }
  }
  const included = r.included !== false;
  // Only while it is still off: his own switch clears the flag, and an "on" row never wears it.
  const offByApp = r.off_by_app === true && !included;
  return {
    id: String(r.id),
    meeting_id: String(r.meeting_id),
    card_id: String(r.card_id ?? ""),
    card: toCard(r.card),
    included,
    position: Number(r.position ?? 0),
    section: String(r.section ?? ""),
    slides,
    quote_candidates: Array.isArray(r.quote_candidates) ? r.quote_candidates.filter((q): q is string => typeof q === "string") : [],
    draft_status: String(r.draft_status ?? "pending") as DraftStatus,
    draft_note: shownNote(typeof r.draft_note === "string" ? r.draft_note : null, offByApp),
    done_in_cc: r.done_in_cc === true,
    off_by_app: offByApp,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

// --- Meetings -------------------------------------------------------------------------------------

/** The meeting being planned or shown, or null. */
export async function getOpenMeeting(): Promise<Meeting | null> {
  const { data, error } = await db().from("mtg_meetings").select(MEETING_COLS).in("status", ["draft", "live"]).order("created_at", { ascending: false }).limit(1);
  if (error) fail("mtg_meetings select open", error);
  return data?.[0] ? toMeeting(data[0] as MeetingRow) : null;
}

/** The open meeting, made when there is none (two at once: the unique index lets one win). */
export async function ensureOpenMeeting(): Promise<Meeting> {
  const open = await getOpenMeeting();
  if (open) return open;
  const { data, error } = await db().from("mtg_meetings").insert({ status: "draft" }).select(MEETING_COLS).single();
  if (error) {
    const again = await getOpenMeeting();
    if (again) return again;
    fail("mtg_meetings insert", error);
  }
  return toMeeting(data as MeetingRow);
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await db().from("mtg_meetings").select(MEETING_COLS).eq("id", id).maybeSingle();
  if (error) fail("mtg_meetings select", error);
  return data ? toMeeting(data as MeetingRow) : null;
}

export type MeetingPatch = Partial<Pick<Meeting, "meets_on" | "title" | "cover_line" | "scoreboard" | "scoreboard_month" | "quote" | "deck" | "deck_version" | "current_slide" | "started_at" | "ended_at" | "status">>;

export async function updateMeeting(id: string, patch: MeetingPatch, onlyStatus?: MeetingStatus[]): Promise<Meeting | null> {
  let q = db().from("mtg_meetings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (onlyStatus) q = q.in("status", onlyStatus);
  const { data, error } = await q.select(MEETING_COLS).maybeSingle();
  if (error) fail("mtg_meetings update", error);
  return data ? toMeeting(data as MeetingRow) : null;
}

/**
 * Moves the live show (one statement in the database, so two quick taps never lose one); the
 * thought of the slide it lands on counts as shown.
 */
export async function moveSlide(meetingId: string, move: { delta?: number; to?: number }): Promise<number | null> {
  const { data, error } = await db().rpc("mtg_move_slide", { p_meeting: meetingId, p_delta: move.delta ?? 0, p_to: move.to ?? null });
  if (error) fail("mtg_move_slide", error);
  return typeof data === "number" ? data : null;
}

/**
 * Puts a deck on the TV at `slide`, only if the meeting is still as `read` says (status, deck
 * version, slide): one statement in the database (mtg_put_deck), which makes it live, bumps the
 * version and counts that slide's thought as shown. The new version, or null when something
 * changed in between (the caller reads again and retries).
 */
export async function putDeck(read: Pick<Meeting, "id" | "status" | "deck_version" | "current_slide">, deck: DrawnSlide[], slide: number): Promise<number | null> {
  const { data, error } = await db().rpc("mtg_put_deck", {
    p_meeting: read.id,
    p_deck: deck,
    p_status: read.status,
    p_version: read.deck_version,
    p_from_slide: read.current_slide,
    p_slide: slide,
  });
  if (error) fail("mtg_put_deck", error);
  return typeof data === "number" ? data : null;
}

/** Done meetings, newest first (no decks: the list only needs titles and dates). */
export async function listPastMeetings(limit = 50): Promise<Meeting[]> {
  const { data, error } = await db().from("mtg_meetings").select(MEETING_LIST_COLS).eq("status", "done").order("ended_at", { ascending: false }).limit(limit);
  if (error) fail("mtg_meetings select done", error);
  return (data ?? []).map((r) => toMeeting(r as MeetingRow));
}

// --- Items ------------------------------------------------------------------------------------------

export async function listItems(meetingId: string): Promise<Item[]> {
  const { data, error } = await db().from("mtg_items").select(ITEM_COLS).eq("meeting_id", meetingId).order("position", { ascending: true }).order("created_at", { ascending: true });
  if (error) fail("mtg_items select", error);
  return (data ?? []).map((r) => toItem(r as Record<string, unknown>));
}

export async function getItem(id: string): Promise<Item | null> {
  const { data, error } = await db().from("mtg_items").select(ITEM_COLS).eq("id", id).maybeSingle();
  if (error) fail("mtg_items select one", error);
  return data ? toItem(data as Record<string, unknown>) : null;
}

export type ItemPatch = Partial<Pick<Item, "card" | "included" | "position" | "section" | "slides" | "quote_candidates" | "draft_status" | "draft_note" | "done_in_cc" | "off_by_app">>;

/**
 * Saves part of a thought. `onlyDraftStatus` and `onlyUpdatedAt` guard it: the row is written only
 * while its draft status is one of those and (for a draft's save) it is still the row as claimed.
 * Null when the guard (or the row) is gone.
 */
export async function updateItem(id: string, patch: ItemPatch, onlyDraftStatus?: DraftStatus[], onlyUpdatedAt?: string): Promise<Item | null> {
  let q = db().from("mtg_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (onlyDraftStatus) q = q.in("draft_status", onlyDraftStatus);
  if (onlyUpdatedAt) q = q.eq("updated_at", onlyUpdatedAt);
  const { data, error } = await q.select(ITEM_COLS).maybeSingle();
  if (error) fail("mtg_items update", error);
  return data ? toItem(data as Record<string, unknown>) : null;
}

/** A new thought: every column named (a row missing one would be saved as null, not the default). */
export interface NewItem {
  meeting_id: string;
  card_id: string;
  card: CardSnapshot;
  position: number;
  included: boolean;
  section: string;
  slides: ContentSlide[];
  quote_candidates: string[];
  draft_status: DraftStatus;
  draft_note: string | null;
  off_by_app: boolean;
}

export async function insertItems(rows: NewItem[]): Promise<void> {
  if (!rows.length) return;
  // A card already in the meeting (a sync that raced another) is left alone.
  const { error } = await db().from("mtg_items").upsert(rows, { onConflict: "meeting_id,card_id", ignoreDuplicates: true });
  if (error) fail("mtg_items insert", error);
}

/** Cards just added to a meeting whose show started meanwhile: switched off by the app, with its note. */
export async function switchOffArrivals(meetingId: string, cardIds: string[]): Promise<void> {
  if (!cardIds.length) return;
  const { error } = await db()
    .from("mtg_items")
    .update({ included: false, off_by_app: true, updated_at: new Date().toISOString() })
    .eq("meeting_id", meetingId)
    .in("card_id", cardIds)
    .eq("included", true)
    .eq("off_by_app", false);
  if (error) fail("mtg_items switch off", error);
}

/**
 * For each card, its thought in the newest earlier meeting (every meeting but the open one is
 * done: only one is open at a time), and whether that meeting's TV landed on it. Cards never seen
 * before are not in the map.
 */
export async function earlierItems(cardIds: string[], notMeetingId: string): Promise<Map<string, { item: Item; shown: boolean }>> {
  const newest = new Map<string, Item>();
  const ids = [...new Set(cardIds)];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await db()
      .from("mtg_items")
      .select(ITEM_COLS)
      .in("card_id", ids.slice(i, i + 50))
      .neq("meeting_id", notMeetingId)
      .order("created_at", { ascending: false });
    if (error) fail("mtg_items select earlier", error);
    for (const r of data ?? []) {
      const item = toItem(r as Record<string, unknown>);
      if (!newest.has(item.card_id)) newest.set(item.card_id, item);
    }
  }
  const out = new Map<string, { item: Item; shown: boolean }>();
  if (!newest.size) return out;
  const { data, error } = await db()
    .from("mtg_meetings")
    .select("id,status,shown_items")
    .in("id", [...new Set([...newest.values()].map((i) => i.meeting_id))]);
  if (error) fail("mtg_meetings select earlier", error);
  const meetings = new Map((data ?? []).map((m) => [String(m.id), m as { status?: unknown; shown_items?: unknown }]));
  for (const [cardId, item] of newest) {
    const m = meetings.get(item.meeting_id);
    if (!m || m.status !== "done") continue;
    out.set(cardId, { item, shown: Array.isArray(m.shown_items) && m.shown_items.includes(item.id) });
  }
  return out;
}

/**
 * A draft still "drafting" this long after it was claimed is taken as stopped (its run died) and
 * may be claimed again: longer than any run can live (a function stops at 300 s, maxDuration).
 */
export const DRAFT_STALE_MS = 6 * 60 * 1000;

/** True when a thought is waiting for a draft: pending, or "drafting" so long its run died. */
export function hasDraftToClaim(items: Item[]): boolean {
  const staleBefore = Date.now() - DRAFT_STALE_MS;
  return items.some((i) => i.draft_status === "pending" || (i.draft_status === "drafting" && Date.parse(i.updated_at) < staleBefore));
}

/** Drafts that run at the same time in one meeting (claimDraft's default). */
export const DRAFTS_AT_ONCE = 3;

/** How many of the meeting's thoughts are being drafted right now (claimed within DRAFT_STALE_MS). */
export async function activeDraftCount(meetingId: string): Promise<number> {
  const { count, error } = await db()
    .from("mtg_items")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId)
    .eq("draft_status", "drafting")
    .gte("updated_at", new Date(Date.now() - DRAFT_STALE_MS).toISOString());
  if (error) fail("mtg_items count drafting", error);
  return count ?? 0;
}

/**
 * Claims a thought for drafting: pending (or a draft left "drafting" by a stopped run for over
 * DRAFT_STALE_MS) becomes drafting, but only while fewer than `max` (3) of the meeting's thoughts
 * are drafting. One statement in the database (mtg_claim_draft locks the meeting, counts and
 * claims), so runs started at the same moment never get past the limit together. Null when the
 * limit is reached, someone else holds it, or it is done. The item comes back with the
 * updated_at this claim wrote, exactly, so the draft's save can check the row is still its.
 */
export async function claimDraft(id: string, opts: { max?: number } = {}): Promise<Item | null> {
  const max = Math.max(1, Math.floor(opts.max ?? DRAFTS_AT_ONCE));
  const { data, error } = await db()
    .rpc("mtg_claim_draft", { p_item: id, p_max: max, p_stale_seconds: Math.round(DRAFT_STALE_MS / 1000) })
    .select(ITEM_COLS);
  if (error) fail("mtg_claim_draft", error);
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? toItem(row as Record<string, unknown>) : null;
}

// --- Settings -----------------------------------------------------------------------------------------

/**
 * After Claude gets connected: the open meeting's thoughts that fell back to a plain Key line
 * (draft "failed", never edited by the owner) go back in line to be drafted.
 */
export async function requeueFailedDrafts(meetingId: string): Promise<number> {
  const { data, error } = await db()
    .from("mtg_items")
    .update({ draft_status: "pending", draft_note: null, updated_at: new Date().toISOString() })
    .eq("meeting_id", meetingId)
    .eq("draft_status", "failed")
    .select("id");
  if (error) fail("mtg_items requeue", error);
  return (data ?? []).length;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await db().from("mtg_settings").select("value").eq("key", key).maybeSingle();
  if (error) fail("mtg_settings select", error);
  return (data?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db().from("mtg_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) fail("mtg_settings upsert", error);
}

// --- Pocket (mtg_pocket, migration 0002) -----------------------------------------------------------

export type PocketDecision = "meeting" | "command_center";

export interface PocketRow {
  recording_id: string;
  title: string;
  summary: string;
  recorded_at: string | null;
  duration_sec: number | null;
  decision: PocketDecision | null;
  decided_at: string | null;
  item_id: string | null;
}

const POCKET_COLS = "recording_id,title,summary,recorded_at,duration_sec,decision,decided_at,item_id";

function toPocketRow(r: Record<string, unknown>): PocketRow {
  return {
    recording_id: String(r.recording_id),
    title: typeof r.title === "string" ? r.title : "",
    summary: typeof r.summary === "string" ? r.summary : "",
    recorded_at: typeof r.recorded_at === "string" ? r.recorded_at : null,
    duration_sec: typeof r.duration_sec === "number" ? r.duration_sec : null,
    decision: r.decision === "meeting" || r.decision === "command_center" ? r.decision : null,
    decided_at: typeof r.decided_at === "string" ? r.decided_at : null,
    item_id: typeof r.item_id === "string" ? r.item_id : null,
  };
}

/** The rows kept for these recordings, by id (missing ones were never seen). */
export async function pocketRows(ids: string[]): Promise<Map<string, PocketRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("mtg_pocket").select(POCKET_COLS).in("recording_id", ids.slice(0, 200));
  if (error) fail("mtg_pocket select", error);
  return new Map((data ?? []).map((r) => [String((r as Record<string, unknown>).recording_id), toPocketRow(r as Record<string, unknown>)]));
}

/** Keeps Pocket's title and summary for recordings (never touches what he decided). */
export async function cachePocket(rows: Array<{ recording_id: string; title: string; summary: string; recorded_at: string | null; duration_sec: number | null }>): Promise<void> {
  if (!rows.length) return;
  const clean = rows.map((r) => ({
    recording_id: r.recording_id.slice(0, 120),
    title: r.title.slice(0, 200),
    summary: r.summary.slice(0, 2000),
    recorded_at: r.recorded_at,
    duration_sec: r.duration_sec == null ? null : Math.max(0, Math.round(r.duration_sec)),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db().from("mtg_pocket").upsert(clean, { onConflict: "recording_id" });
  if (error) fail("mtg_pocket upsert", error);
}

/** What he decided for a recording (null takes it back), and the thought it made. */
export async function decidePocket(recordingId: string, decision: PocketDecision | null, itemId: string | null = null): Promise<void> {
  const { error } = await db()
    .from("mtg_pocket")
    .update({ decision, decided_at: decision ? new Date().toISOString() : null, item_id: itemId, updated_at: new Date().toISOString() })
    .eq("recording_id", recordingId);
  if (error) fail("mtg_pocket decide", error);
}
