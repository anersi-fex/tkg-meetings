import "server-only";
import { buildDeck, type BuiltDeck, type DeckItem } from "./deck";
import { CommandCenterError, listTeamCards, markCardDone, type TeamCard } from "./command-center";
import { earlierItems, getMeeting, getOpenMeeting, insertItems, listItems, putDeck, storedNote, updateItem, updateMeeting, type MeetingPatch, type NewItem } from "./data";
import { readScore } from "./scorecard";
import { todayInDetroit } from "./month";
import type { DrawnSlide } from "./slides";
import type { CardSnapshot, Item, Meeting, MeetingStatus, ShowState } from "./types";

/**
 * The meeting's life: read the Team meeting folder into the open meeting, build the deck, start
 * the show, keep the TV's copy fresh while it is live, pause and resume it, end it (and mark the
 * thoughts the TV showed done in Command Center). Server only; callers checked the session.
 */

export type SyncResult = { ok: true; added: number; changed: number } | { ok: false; message: string; kind: CommandCenterError["kind"] };

const sameCard = (a: CardSnapshot, b: CardSnapshot) => a.title === b.title && a.summary === b.summary && a.points.join("\n") === b.points.join("\n");

export const EDITED_CHANGED = "Changed in Command Center since you edited it: tap Redo for a fresh draft.";
export const SHOWN_NOT_DONE = "Shown at the last meeting but not marked done in Command Center, so it's switched off.";

/**
 * A card coming into the meeting. Pure.
 *
 * Its switch: on, unless the show already started (Play; live or paused): then it comes in off,
 * switched off by the app (off_by_app, which shows "Came in during the meeting: switch it on to
 * show it."), so nothing he has not looked at reaches the TV mid-meeting.
 *
 * One seen in an earlier meeting comes back as it was there (its slides, section, quotes, draft
 * and switch), redrafted only when the card changed and he had not edited it. Its switch there
 * carries over, except: one the TV showed but Command Center never marked done comes back off
 * with a note; one he reopened in Command Center after a meeting marked it done counts as new
 * (on); one the app switched off there (it came in during that show) and he never switched comes
 * back on, as it would have been had it come in before the show.
 */
export function newItem(meetingId: string, c: TeamCard, position: number, midShow: boolean, before?: { item: Item; shown: boolean }): NewItem {
  const fresh: NewItem = { meeting_id: meetingId, card_id: c.id, card: c.card, position, included: !midShow, off_by_app: midShow, section: "", slides: [], quote_candidates: [], draft_status: "pending", draft_note: null };
  const p = before?.item;
  if (!p || !p.slides.length || p.draft_status === "pending" || p.draft_status === "drafting") return fresh;
  const changed = !sameCard(p.card, c.card);
  // His own edit stays; Claude's draft is done again when the card changed (or when it never
  // reached Claude: "failed" is the plain fallback line).
  const status = p.draft_status === "edited" ? "edited" : changed || p.draft_status === "failed" ? "pending" : p.draft_status;
  const shownNotDone = before.shown && !p.done_in_cc;
  const on = shownNotDone ? false : (before.shown && p.done_in_cc) || (p.off_by_app && !before.shown) ? true : p.included;
  const note = shownNotDone ? SHOWN_NOT_DONE : status === "edited" && changed ? EDITED_CHANGED : status === p.draft_status ? storedNote(p.draft_note) : null;
  return {
    ...fresh,
    included: on && !midShow,
    off_by_app: on && midShow,
    section: p.section,
    slides: p.slides,
    quote_candidates: p.quote_candidates,
    draft_status: status,
    draft_note: note,
  };
}

/**
 * Brings the open meeting up to date with Command Center: new cards come in at the bottom (see
 * newItem), changed ones are redrafted unless the owner edited them, and cards no longer open
 * there are marked so the phone can say so (they stay, the owner decides). A meeting that ended
 * while Command Center was answering is left as it is (its next meeting picks the cards up).
 */
export async function syncFromCommandCenter(meeting: Meeting): Promise<SyncResult> {
  let cards;
  try {
    cards = await listTeamCards();
  } catch (err) {
    if (err instanceof CommandCenterError) return { ok: false, message: err.message, kind: err.kind };
    return { ok: false, message: "Command Center didn't answer.", kind: "unreachable" };
  }
  // Read again now, not before: Command Center can take seconds to answer, and Play or End may
  // have landed meanwhile.
  const now = await getMeeting(meeting.id);
  if (!now || now.status === "done") return { ok: true, added: 0, changed: 0 };
  const items = await listItems(meeting.id);
  const byCard = new Map(items.filter((i) => i.card_id).map((i) => [i.card_id, i]));
  let position = items.reduce((m, i) => Math.max(m, i.position), 0);
  const fresh = cards.filter((c) => !byCard.has(c.id)).reverse(); // oldest new card first
  if (fresh.length) {
    const before = await earlierItems(fresh.map((c) => c.id), meeting.id);
    // Played already (live, or paused and not ended): new thoughts wait, switched off.
    const midShow = now.started_at != null;
    await insertItems(fresh.map((c) => newItem(meeting.id, c, ++position, midShow, before.get(c.id))));
  }

  let changed = 0;
  const open = new Set(cards.map((c) => c.id));
  for (const c of cards) {
    const item = byCard.get(c.id);
    if (!item) continue;
    const textChanged = !sameCard(item.card, c.card);
    if (!textChanged && item.card.open) continue;
    changed++;
    if (textChanged) {
      // Back in line for a new draft. The write never touches a row he edited (even one edited
      // since this sync read it), and it also moves a row that is drafting right now: that draft,
      // of the old card, is then refused when it saves, and the new card is drafted.
      if (item.draft_status !== "edited" && (await updateItem(item.id, { card: c.card, draft_status: "pending" }, ["ready", "failed", "pending", "drafting"]))) continue;
      // He edited it: his slides stay, with a note.
      if (await updateItem(item.id, { card: c.card, draft_note: EDITED_CHANGED }, ["edited"])) continue;
    }
    await updateItem(item.id, { card: c.card });
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
    .map((i) => ({ id: i.id, section: i.section, slides: i.slides, title: i.card.title }));
}

export async function buildMeetingDeck(meeting: Meeting, items?: Item[]): Promise<BuiltDeck> {
  const today = todayInDetroit();
  const list = items ?? (await listItems(meeting.id));
  const score = meeting.scoreboard ? await readScore(meeting.scoreboard_month, today) : null;
  const built = buildDeck(
    { title: meeting.title, meetsOn: meeting.meets_on, coverLine: meeting.cover_line, scoreboard: meeting.scoreboard, quote: meeting.quote },
    deckItems(list),
    score,
    today,
  );
  // Each content slide names its thought: the TV's copy is mapped by it after a change, and the
  // slides the TV lands on count their thought as shown (End meeting marks exactly those done).
  const slides = built.slides.map((s, i) => {
    const itemId = built.itemOfSlide[i];
    return itemId && s.itemId !== itemId ? { ...s, itemId } : s;
  });
  return { ...built, slides };
}

// --- The show ------------------------------------------------------------------------------------

/** What a slide is, across two builds of the deck: its thought, else its kind (cover, agenda...). */
const slideKey = (s: DrawnSlide) => (s.itemId ? `item:${s.itemId}` : `layout:${s.layout}`);

/** Which of the slides with the same key `deck[at]` is (the second slide of a thought is 1). */
function occurrence(deck: DrawnSlide[], at: number): number {
  const key = slideKey(deck[at]);
  let n = 0;
  for (let i = 0; i < at; i++) if (slideKey(deck[i]) === key) n++;
  return n;
}

/**
 * Where the slide on screen lands in a rebuilt deck: the same thought and the same slide of it
 * (or the same cover, Scorecard, agenda or quote slide), wherever it moved. When it is gone (he
 * switched it off), the first slide after it in the old deck that is still there; the same number,
 * cut to the deck, only as a last resort. Pure.
 */
export function mapSlide(oldDeck: DrawnSlide[] | null, at: number, next: DrawnSlide[]): number {
  const last = Math.max(0, next.length - 1);
  if (!oldDeck || at < 0 || at >= oldDeck.length) return Math.min(Math.max(0, at), last);
  const find = (j: number) => {
    const key = slideKey(oldDeck[j]);
    const places: number[] = [];
    next.forEach((s, i) => {
      if (slideKey(s) === key) places.push(i);
    });
    return places.length ? places[Math.min(occurrence(oldDeck, j), places.length - 1)] : -1;
  };
  for (let j = at; j < oldDeck.length; j++) {
    const i = find(j);
    if (i >= 0) return i;
  }
  return Math.min(at, last);
}

/** How a deck goes on the TV: "play" (a new show from the cover, a paused one where it stopped, a live one stays put), "restart" (the cover), "refresh" (live only, stays put). */
type PutMode = "play" | "restart" | "refresh";
export type PutResult = { slide: number; total: number; was: "new" | "paused" | "live" };

/**
 * Builds the deck and puts it on the TV in one guarded write (putDeck): if a click or another
 * change lands between the read and the write, it reads the meeting again and retries. Null when
 * the meeting is gone, ended, not live for a refresh, or kept changing.
 */
async function putOnTv(meetingId: string, mode: PutMode): Promise<PutResult | null> {
  const allowed: MeetingStatus[] = mode === "refresh" ? ["live"] : ["draft", "live"];
  for (let attempt = 0; attempt < 4; attempt++) {
    const meeting = await getMeeting(meetingId);
    if (!meeting || !allowed.includes(meeting.status)) return null;
    const was = meeting.status === "live" ? "live" : meeting.started_at ? "paused" : "new";
    const built = await buildMeetingDeck(meeting);
    const slide = mode === "restart" || was === "new" ? 0 : mapSlide(meeting.deck, meeting.current_slide, built.slides);
    const version = await putDeck(meeting, built.slides, slide);
    if (version != null) return { slide, total: built.slides.length, was };
  }
  console.error("put_deck_gave_up", meetingId);
  return null;
}

/**
 * Play: a new show starts at the cover, a paused one resumes on the thought it stopped on (in the
 * deck rebuilt now, with Scorecard's numbers of the moment), and a live one only gets its deck
 * refreshed (a stale screen never sends the room back to the start).
 */
export function startShow(meetingId: string): Promise<PutResult | null> {
  return putOnTv(meetingId, "play");
}

/** Start from the cover: the open meeting goes on the TV at slide 1, whatever it was doing. */
export function restartShow(meetingId: string): Promise<PutResult | null> {
  return putOnTv(meetingId, "restart");
}

/** After a change while the show is live, the TV's copy is rebuilt; the same slide stays on screen. */
export async function refreshLiveDeck(meetingId: string): Promise<void> {
  await putOnTv(meetingId, "refresh");
}

/** Pause: the TV goes back to its waiting screen; the deck and the slide are kept for Play. */
export function pauseShow(meetingId: string): Promise<Meeting | null> {
  return updateMeeting(meetingId, { status: "draft" }, ["live"]);
}

export type EndResult = { marked: number; failed: number; message: string | null };

/**
 * Ends the meeting (live, paused or never played): every thought the TV landed on is marked done
 * in Command Center (best effort; the ones that fail can be retried from Past), then it moves to
 * Past with the deck it showed (or, never played, the deck as planned). Marking comes first, while
 * the meeting is still the open one: a page loaded meanwhile (another phone, a tab, a tap on the
 * clicker) keeps to this meeting instead of starting the next one while these cards are still open
 * in Command Center (they would come into it switched off, with a wrong "not marked done" note).
 * Null when it was already ended (another phone, a second tap).
 */
export async function endMeeting(meetingId: string): Promise<EndResult | null> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || meeting.status === "done") return null;
  const first = await markShownDone(meeting);
  const now = await getMeeting(meetingId);
  if (!now || now.status === "done") return null;
  const patch: MeetingPatch = { status: "done", ended_at: new Date().toISOString() };
  // Never played: Past keeps the deck as planned. Played: the TV's deck stays as it is.
  if (!now.deck) patch.deck = (await buildMeetingDeck(now)).slides;
  const ended = await updateMeeting(meeting.id, patch, ["draft", "live"]);
  if (!ended) return null;
  // A click from another phone while the cards were being marked may have landed on one more.
  const tried = new Set(meeting.shown_items);
  const late = ended.shown_items.filter((id) => !tried.has(id));
  if (!late.length) return first;
  const more = await markShownDone({ ...ended, shown_items: late });
  return { marked: first.marked + more.marked, failed: first.failed + more.failed, message: first.message ?? more.message };
}

/** The thoughts End meeting marks done: the ones the TV landed on, with a card, not marked yet. */
export function toMarkDone(meeting: Meeting, items: Item[]): Item[] {
  const shown = new Set(meeting.shown_items);
  return items.filter((i) => shown.has(i.id) && i.card_id && !i.done_in_cc);
}

/** Marking stops starting new calls after this long; the rest wait for "Mark them done now" on Past. */
const MARK_BUDGET_MS = 40_000;

/** Marks the shown thoughts done in Command Center (again only the ones not done yet). */
export async function markShownDone(meeting: Meeting): Promise<EndResult> {
  const items = toMarkDone(meeting, await listItems(meeting.id));
  const stopAt = Date.now() + MARK_BUDGET_MS;
  let marked = 0;
  let message: string | null = null;
  for (const item of items) {
    if (Date.now() > stopAt) {
      message ??= "Command Center is slow: mark the rest from Past";
      break;
    }
    try {
      await markCardDone(item.card_id);
      await updateItem(item.id, { done_in_cc: true });
      marked++;
    } catch (err) {
      message = err instanceof CommandCenterError ? err.message : "Command Center didn't answer.";
      // Not connected, a refused token, or no answer: the rest would wait and fail the same way.
      // A tool error is about that one card, so the others still go.
      if (!(err instanceof CommandCenterError) || err.kind !== "tool") break;
    }
  }
  const failed = items.length - marked;
  return { marked, failed, message: failed ? message : null };
}

/** The deployed build (the TV reloads itself when it changes). */
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.BUILD_ID ?? "dev";

/** The deck without its speaker notes: only the owner's clicker reads them. */
const withoutNotes = (deck: DrawnSlide[]): DrawnSlide[] => deck.map((s) => ({ ...s, notes: "" }));

/**
 * What the TV and the clicker poll. The deck rides along only when the caller's key (?k=, the
 * deckKey it last got) is not the meeting's current one, and its speaker notes only for the owner.
 */
export async function showState(knownKey: string | null, opts: { withNotes: boolean }): Promise<ShowState> {
  const meeting = await getOpenMeeting();
  if (!meeting || meeting.status !== "live" || !meeting.deck?.length) {
    return { status: "idle", meetingId: meeting?.id ?? null, current: 0, total: 0, deckVersion: meeting?.deck_version ?? 0, deckKey: "", meetsOn: meeting?.meets_on ?? null, build: BUILD };
  }
  const deckKey = `${meeting.id}:${meeting.deck_version}`;
  const state: ShowState = {
    status: "live",
    meetingId: meeting.id,
    current: Math.min(meeting.current_slide, meeting.deck.length - 1),
    total: meeting.deck.length,
    deckVersion: meeting.deck_version,
    deckKey,
    meetsOn: meeting.meets_on,
    build: BUILD,
  };
  if (knownKey !== deckKey) state.deck = opts.withNotes ? meeting.deck : withoutNotes(meeting.deck);
  return state;
}
