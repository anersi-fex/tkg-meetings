import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listPastMeetings } from "@/lib/data";
import { ListCard, RowChevron } from "@/components/tide";
import { PageTitle, formatDate } from "@/components/ui";

export const metadata: Metadata = { title: "Past meetings" };
export const dynamic = "force-dynamic";

export default async function PastPage() {
  await requirePage("owner");
  const meetings = await listPastMeetings();
  return (
    <div>
      <PageTitle sub="Every meeting you ended, with the slides it showed.">Past</PageTitle>
      {meetings.length === 0 ? (
        <div className="rounded-[22px] bg-surface px-5 py-8 text-center shadow-card">
          <p className="text-[16px] font-bold text-gray-900">No meetings yet</p>
          <p className="mt-1.5 text-[14px] text-gray-600">When you end a meeting, it lands here.</p>
        </div>
      ) : (
        <ListCard>
          {meetings.map((m) => (
            <li key={m.id} className="relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:h-px not-first:before:bg-line">
              <Link href={`/past/${m.id}`} className="flex items-center gap-3 px-4 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-gray-900">{m.title}</span>
                  <span className="block text-[13px] text-gray-500">{formatDate(m.meets_on ?? m.ended_at)}</span>
                </span>
                <RowChevron />
              </Link>
            </li>
          ))}
        </ListCard>
      )}
    </div>
  );
}
