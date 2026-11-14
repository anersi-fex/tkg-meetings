import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getItem, getMeeting } from "@/lib/data";
import { buildMeetingDeck } from "@/lib/meeting";
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
  // The eyebrow the slide gets in the deck ("2 · Bonuses") and the deck's length, for the preview.
  const deck = await buildMeetingDeck(meeting);
  const at = deck.itemOfSlide.indexOf(item.id);
  const eyebrow = at >= 0 ? (deck.slides[at].eyebrow ?? "") : item.section;
  return <Editor item={item} eyebrow={eyebrow} deckLength={deck.slides.length} firstIndex={at >= 0 ? at + 1 : null} />;
}
