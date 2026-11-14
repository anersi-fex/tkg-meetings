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

const MEETING_COLS = "id,status,meets_on,title,cover_line,scoreboard,scoreboard_month,quote,deck,deck_version,current_slide,started_at,ended_at,created_at,updated_at";
const MEETING_LIST_COLS = "id,status,meets_on,title,cover_line,scoreboard,scoreboard_month,quote,deck_version,current_slide,started_at,ended_at,created_at,updated_at";
const ITEM_COLS = "id,meeting_id,card_id,card,included,position,section,slides,quote_candidates,draft_status,draft_note,done_in_cc,created_at,updated_at";

type MeetingRow = Omit<Meeting, "deck"> & { deck?: unknown };

function toMeeting(r: MeetingRow): Meeting {
  const q = r.quote as { text?: unknown; name?: unknown } | null;
  return {
    ...r,
    scoreboard_month: (["auto", "this", "last"].includes(r.scoreboard_month) ? r.scoreboard_month : "auto") as ScoreboardMonth,
    quote: q && typeof q.text === "string" && q.text.trim() ? { text: q.text, name: typeof q.name === "string" && q.name ? q.name : "Anersi Koka" } : null,
    deck: Array.isArray(r.deck) ? (r.deck as DrawnSlide[]) : null,
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
  };
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
  return {
    id: String(r.id),
    meeting_id: String(r.meeting_id),
    card_id: String(r.card_id ?? ""),
    card: toCard(r.card),
    included: r.included !== false,
    position: Number(r.position ?? 0),
    section: String(r.section ?? ""),
    slides,
    quote_candidates: Array.isArray(r.quote_candidates) ? r.quote_candidates.filter((q): q is string => typeof q === "string") : [],
    draft_status: String(r.draft_status ?? "pending") as DraftStatus,
    draft_note: (r.draft_note as string | null) ?? null,
    done_in_cc: r.done_in_cc === true,
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

/** Moves the live show (one statement in the database, so two quick taps never lose one). */
export async function moveSlide(meetingId: string, move: { delta?: number; to?: number }): Promise<number | null> {
  const { data, error } = await db().rpc("mtg_move_slide", { p_meeting: meetingId, p_delta: move.delta ?? 0, p_to: move.to ?? null });
  if (error) fail("mtg_move_slide", error);
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

export type ItemPatch = Partial<Pick<Item, "card" | "included" | "position" | "section" | "slides" | "quote_candidates" | "draft_status" | "draft_note" | "done_in_cc">>;

export async function updateItem(id: string, patch: ItemPatch, onlyDraftStatus?: DraftStatus[]): Promise<Item | null> {
  let q = db().from("mtg_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (onlyDraftStatus) q = q.in("draft_status", onlyDraftStatus);
  const { data, error } = await q.select(ITEM_COLS).maybeSingle();
  if (error) fail("mtg_items update", error);
  return data ? toItem(data as Record<string, unknown>) : null;
}

export async function insertItems(rows: Array<{ meeting_id: string; card_id: string; card: CardSnapshot; position: number; included: boolean }>): Promise<void> {
  if (!rows.length) return;
  // A card already in the meeting (a sync that raced another) is left alone.
  const { error } = await db().from("mtg_items").upsert(rows, { onConflict: "meeting_id,card_id", ignoreDuplicates: true });
  if (error) fail("mtg_items insert", error);
}

/**
 * Claims a thought for drafting: pending (or a draft left "drafting" by a stopped run for over
 * three minutes) becomes drafting. Null when someone else holds it or it is done.
 */
export async function claimDraft(id: string): Promise<Item | null> {
  // Two plain claims, never one "or" filter: PostgREST refuses or= on an update (column "does not
  // exist"). Pending first; else a draft stuck "drafting" for over 3 minutes (its run died).
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const claim = async (status: DraftStatus, olderThan?: string) => {
    let q = db().from("mtg_items").update({ draft_status: "drafting", updated_at: now }).eq("id", id).eq("draft_status", status);
    if (olderThan) q = q.lt("updated_at", olderThan);
    const { data, error } = await q.select(ITEM_COLS).maybeSingle();
    if (error) fail("mtg_items claim", error);
    return data ? toItem(data as Record<string, unknown>) : null;
  };
  return (await claim("pending")) ?? (await claim("drafting", staleBefore));
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
