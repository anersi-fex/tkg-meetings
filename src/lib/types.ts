import type { ContentSlide, DrawnSlide } from "./slides";

/** Rows as the app reads them. Dates are "YYYY-MM-DD"; instants are ISO strings. Browser-safe. */

export type MeetingStatus = "draft" | "live" | "done";
export type ScoreboardMonth = "auto" | "this" | "last";

export interface Meeting {
  id: string;
  status: MeetingStatus;
  meets_on: string | null;
  title: string;
  cover_line: string;
  scoreboard: boolean;
  scoreboard_month: ScoreboardMonth;
  quote: { text: string; name: string } | null;
  deck: DrawnSlide[] | null;
  deck_version: number;
  current_slide: number;
  /** The thoughts (mtg_items.id) whose slides the TV has shown; End meeting marks exactly these done. */
  shown_items: string[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A Command Center card as this app keeps it (what it said when last read). */
export interface CardSnapshot {
  title: string;
  summary: string;
  points: string[];
  people: string[];
  /** When he last said it (ISO), or null. */
  said_at: string | null;
  /** False once the card is no longer open in Command Center's Team meeting folder. */
  open: boolean;
  /** A Pocket recording's transcript (his own words), for drafting only; never shown. */
  transcript?: string;
}

export type DraftStatus = "pending" | "drafting" | "ready" | "failed" | "edited";

export interface Item {
  id: string;
  meeting_id: string;
  card_id: string;
  card: CardSnapshot;
  included: boolean;
  position: number;
  section: string;
  slides: ContentSlide[];
  quote_candidates: string[];
  draft_status: DraftStatus;
  /**
   * What to tell him about it (a check, a reason it is off), or null. While the app keeps it
   * switched off (off_by_app) it starts with "Came in during the meeting: switch it on to show it."
   */
  draft_note: string | null;
  done_in_cc: boolean;
  /**
   * Switched off by the app, not by him: it came in after the show started, so it waits for him.
   * His own switch clears it; still off this way and never shown, it comes back on at the next meeting.
   */
  off_by_app: boolean;
  created_at: string;
  updated_at: string;
}

/** What the TV and the clicker poll (GET /api/show). */
export interface ShowState {
  status: "idle" | "live";
  meetingId: string | null;
  current: number;
  total: number;
  deckVersion: number;
  /**
   * "<meetingId>:<deckVersion>": the caller sends it back as ?k= and gets the deck only when it
   * differs (versions start over in every meeting, so the version alone is not enough). "" when idle.
   */
  deckKey: string;
  /** The deck, sent only when the caller's key is out of date. Speaker notes only for the owner. */
  deck?: DrawnSlide[];
  /** The planned date of the next meeting (for the TV's waiting screen). */
  meetsOn: string | null;
  /** The deployed build (the TV reloads itself when it changes). */
  build: string;
}

/** An item as a client component gets it: the Pocket transcript stays on the server (drafting only). */
export function forBrowser(item: Item): Item {
  if (item.card.transcript === undefined) return item;
  const card = { ...item.card };
  delete card.transcript;
  return { ...item, card };
}
