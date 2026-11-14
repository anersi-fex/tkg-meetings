import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getOpenMeeting, listItems } from "@/lib/data";
import { showState } from "@/lib/meeting";
import { Clicker } from "./clicker";

export const metadata: Metadata = { title: "Clicker" };
export const dynamic = "force-dynamic";

export default async function PresentPage() {
  await requirePage("owner");
  const state = await showState(null);
  if (state.status !== "live") {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <p className="text-[20px] font-extrabold tracking-[-0.02em] text-gray-900">Nothing is on the TV</p>
        <p className="mt-1.5 text-[14px] text-gray-600">Start the show from Next meeting.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-tide-strong px-5 text-[15px] font-bold text-white shadow-glow">
          Next meeting
        </Link>
      </div>
    );
  }
  const meeting = await getOpenMeeting();
  const items = meeting ? await listItems(meeting.id) : [];
  const toMark = items.filter((i) => i.included && i.card_id && i.slides.length && !i.done_in_cc).map((i) => i.card.title || "A thought");
  return <Clicker initial={state} toMark={toMark} />;
}
