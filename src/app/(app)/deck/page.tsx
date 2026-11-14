import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { ensureOpenMeeting } from "@/lib/data";
import { buildMeetingDeck } from "@/lib/meeting";
import { DeckList } from "@/components/deck-list";
import { Notice, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Preview" };
export const dynamic = "force-dynamic";

/** Every slide of the next meeting, in order, as the TV will show it. */
export default async function DeckPage() {
  await requirePage("owner");
  const meeting = await ensureOpenMeeting();
  const deck = await buildMeetingDeck(meeting);
  return (
    <div>
      <Link href="/" className="-ml-2 mb-1 inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-bold text-accent-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Next meeting
      </Link>
      <PageTitle sub={`${deck.slides.length} slides, in order`}>Preview</PageTitle>
      {deck.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {deck.warnings.map((w) => (
            <Notice key={w} tone="amber">
              {w}
            </Notice>
          ))}
        </div>
      )}
      <DeckList slides={deck.slides} uidPrefix="preview" />
    </div>
  );
}
