import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getMeeting, listItems } from "@/lib/data";
import { DeckList } from "@/components/deck-list";
import { ActionButton } from "@/components/action-button";
import { Notice, PageTitle, formatDate } from "@/components/ui";
import { retryMarkDone } from "../../actions";

export const metadata: Metadata = { title: "Past meeting" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PastMeetingPage({ params }: PageProps<"/past/[id]">) {
  await requirePage("owner");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const meeting = await getMeeting(id);
  if (!meeting || meeting.status !== "done") notFound();
  const items = await listItems(id);
  const notMarked = items.filter((i) => i.included && i.card_id && i.slides.length && !i.done_in_cc).length;
  const retry = retryMarkDone.bind(null, id);
  return (
    <div>
      <Link href="/past" className="-ml-2 mb-1 inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-bold text-accent-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Past
      </Link>
      <PageTitle sub={`${formatDate(meeting.meets_on ?? meeting.ended_at)} · ${meeting.deck?.length ?? 0} slides`}>{meeting.title}</PageTitle>
      {notMarked > 0 && (
        <div className="mb-4 space-y-2">
          <Notice tone="amber">
            {notMarked} {notMarked === 1 ? "thought wasn't" : "thoughts weren't"} marked done in Command Center yet.
          </Notice>
          <ActionButton action={retry} label="Mark them done now" busyLabel="Marking…" />
        </div>
      )}
      <DeckList slides={meeting.deck ?? []} uidPrefix={`past-${id}`} />
    </div>
  );
}
