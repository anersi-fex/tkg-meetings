import "server-only";
import { buildDeck, type BuiltDeck, type DeckItem } from "./deck";
import { CommandCenterError, listTeamCards, markCardDone } from "./command-center";
import { getMeeting, getOpenMeeting, insertItems, listItems, updateItem, updateMeeting } from "./data";
import { readScore } from "./scorecard";
import { todayInDetroit } from "./month";
import type { CardSnapshot, Item, Meeting, ShowState } from "./types";

/**
 * The meeting's life: read the Team meeting folder into the open meeting, build the deck, start
 * the show, keep the TV's copy fresh while it is live, end it (and mark the shown cards done in
 * Command Center). Server only; callers checked the session.
 */

export type SyncResult = { ok: true; added: number; changed: number } | { ok: false; message: string; kind: CommandCenterError["kind"] };

const sameCard = (a: CardSnapshot, b: CardSnapshot) => a.title === b.title && a.summary === b.summary && a.points.join("\n") === b.points.join("\n");

/**
 * Brings the open meeting up to date with Command Center: new cards come in at the bottom
 * (switched on), changed ones are redrafted unless the owner edited them, and cards no longer
 * open there are marked so the phone can say so (they stay, the owner decides).
 */
export async function syncFromCommandCenter(meeting: Meeting): Promise<SyncResult> {
  let cards;
  try {
    cards = await listTeamCards();
  } catch (err) {
    if (err instanceof CommandCenterError) return { ok: false, message: err.message, kind: err.kind };
    return { ok: false, message: "Command Center didn't answer.", kind: "unreachable" };
  }
  const items = await listItems(meeting.id);
  const byCard = new Map(items.filter((i) => i.card_id).map((i) => [i.card_id, i]));
  let position = items.reduce((m, i) => Math.max(m, i.position), 0);
  const fresh = cards.filter((c) => !byCard.has(c.id)).reverse(); // oldest new card first
  await insertItems(fresh.map((c) => ({ meeting_id: meeting.id, card_id: c.id, card: c.card, position: ++position, included: true })));

  let changed = 0;
  const open = new Set(cards.map((c) => c.id));
  for (const c of cards) {
    const item = byCard.get(c.id);
    if (!item) continue;
    if (!sameCard(item.card, c.card) || !item.card.open) {
      changed++;
      const redraft = !sameCard(item.card, c.card) && item.draft_status !== "edited" && item.draft_status !== "drafting";
      await updateItem(item.id, { card: c.card, ...(redraft ? { draft_status: "pending" as const } : {}) });
    }
  }
  for (const item of items) {
    if (item.card_id && item.card.open && !open.has(item.card_id) && !item.done_in_cc) {
      await updateItem(item.id, { card: { ...item.card, open: false } });
    }
  }
  return { ok: true, added: fresh.length, changed };
}

export function deckItems(items: Item[]): DeckItem[] {
  return items
    .filter((i) => i.included && i.slides.length > 0)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ id: i.id, section: i.section, slides: i.slides }));
}

export async function buildMeetingDeck(meeting: Meeting, items?: Item[]): Promise<BuiltDeck> {
  const today = todayInDetroit();
  const list = items ?? (await listItems(meeting.id));
  const score = meeting.scoreboard ? await readScore(meeting.scoreboard_month, today) : null;
  return buildDeck(
    { title: meeting.title, meetsOn: meeting.meets_on, coverLine: meeting.cover_line, scoreboard: meeting.scoreboard, quote: meeting.quote },
    deckItems(list),
    score,
    today,
  );
}

/** Starts the show: the deck is built now (with Scorecard's numbers of the moment) and the TV picks it up. */
export async function startShow(meetingId: string): Promise<Meeting | null> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.status === "done") return null;
  const deck = await buildMeetingDeck(meeting);
  return updateMeeting(
    meeting.id,
    { status: "live", deck: deck.slides, deck_version: meeting.deck_version + 1, current_slide: 0, started_at: meeting.started_at ?? new Date().toISOString() },
    ["draft", "live"],
  );
}

/** After a change while the show is live, the TV's copy is rebuilt (the slide on screen stays put). */
export async function refreshLiveDeck(meetingId: string): Promise<void> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.status !== "live") return;
  const deck = await buildMeetingDeck(meeting);
  await updateMeeting(meeting.id, { deck: deck.slides, deck_version: meeting.deck_version + 1, current_slide: Math.min(meeting.current_slide, Math.max(0, deck.slides.length - 1)) }, ["live"]);
}

/** Back to planning: the TV goes back to its waiting screen; nothing is marked done. */
export async function pauseShow(meetingId: string): Promise<void> {
  await updateMeeting(meetingId, { status: "draft", current_slide: 0 }, ["live"]);
}

export type EndResult = { marked: number; failed: number; message: string | null };

/**
 * Ends the meeting: it moves to Past with the deck it showed, and every thought it showed is
 * marked done in Command Center (best effort; the ones that fail can be retried from Past).
 */
export async function endMeeting(meetingId: string): Promise<EndResult> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.status === "done") return { marked: 0, failed: 0, message: null };
  const deck = meeting.deck ?? (await buildMeetingDeck(meeting)).slides;
  await updateMeeting(meeting.id, { status: "done", deck, ended_at: new Date().toISOString() }, ["draft", "live"]);
  return markShownDone(meeting.id);
}

/** Marks the shown thoughts done in Command Center (again only the ones not done yet). */
export async function markShownDone(meetingId: string): Promise<EndResult> {
  const items = (await listItems(meetingId)).filter((i) => i.included && i.card_id && !i.done_in_cc && i.slides.length > 0);
  let marked = 0;
  let failed = 0;
  let message: string | null = null;
  for (const item of items) {
    try {
      await markCardDone(item.card_id);
      await updateItem(item.id, { done_in_cc: true });
      marked++;
    } catch (err) {
      failed++;
      message = err instanceof CommandCenterError ? err.message : "Command Center didn't answer.";
      if (err instanceof CommandCenterError && (err.kind === "not_connected" || err.kind === "unauthorized")) break;
    }
  }
  return { marked, failed: items.length - marked, message: failed || items.length > marked ? message : null };
}

/** What the TV and the clicker poll. The deck rides along only when the caller's copy is old. */
export async function showState(knownVersion: number | null): Promise<ShowState> {
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.BUILD_ID ?? "dev";
  const meeting = await getOpenMeeting();
  if (!meeting || meeting.status !== "live" || !meeting.deck?.length) {
    return { status: "idle", meetingId: meeting?.id ?? null, current: 0, total: 0, deckVersion: meeting?.deck_version ?? 0, meetsOn: meeting?.meets_on ?? null, build };
  }
  const state: ShowState = {
    status: "live",
    meetingId: meeting.id,
    current: Math.min(meeting.current_slide, meeting.deck.length - 1),
    total: meeting.deck.length,
    deckVersion: meeting.deck_version,
    meetsOn: meeting.meets_on,
    build,
  };
  if (knownVersion !== meeting.deck_version) state.deck = meeting.deck;
  return state;
}
