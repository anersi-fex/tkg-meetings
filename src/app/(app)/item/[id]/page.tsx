import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { requirePage } from "@/lib/auth";
import { getItem, getMeeting, hasDraftToClaim } from "@/lib/data";
import { draftPending } from "@/lib/draft";
import { buildMeetingDeck, refreshLiveDeck } from "@/lib/meeting";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Slide" };
export const dynamic = "force-dynamic";
// Redo drafts the thought after it answers (after()), up to this long.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  await requirePage("owner");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const item = await getItem(id);
  if (!item) notFound();
  const meeting = await getMeeting(item.meeting_id);
  if (!meeting || meeting.status === "done") notFound();
  // Waiting for a draft (a Redo while three others were drafting): this page looks again every
  // few seconds while it waits, and each look starts a run that drafts it once a place is free,
  // as Next meeting does. A finished draft goes on the TV when the show is live, as Redo's does.
  if (hasDraftToClaim([item])) {
    after(() =>
      draftPending(meeting.id)
        .then((n) => (n > 0 ? refreshLiveDeck(meeting.id) : undefined))
        .catch(() => undefined),
    );
  }
  // The eyebrow the slide gets in the deck ("2 · Bonuses") and the deck's length, for the preview.
  const deck = await buildMeetingDeck(meeting);
  const at = deck.itemOfSlide.indexOf(item.id);
  const eyebrow = at >= 0 ? (deck.slides[at].eyebrow ?? "") : item.section;
  return <Editor item={item} eyebrow={eyebrow} deckLength={deck.slides.length} firstIndex={at >= 0 ? at + 1 : null} />;
}
