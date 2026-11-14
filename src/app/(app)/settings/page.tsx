import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { appBase } from "@/lib/app-url";
import { commandCenterAccess, anthropicKey } from "@/lib/secrets";
import { readScore } from "@/lib/scorecard";
import { todayInDetroit } from "@/lib/month";
import { MODEL } from "@/lib/draft";
import { ListCard, ListTitle, RowChevron } from "@/components/tide";
import { PageTitle } from "@/components/ui";
import { formatDollars } from "@/lib/money";
import { ConnectionForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
// Connecting Claude drafts the thoughts that fell back after it answers (after()), up to this long.
export const maxDuration = 300;

export default async function SettingsPage() {
  await requirePage("owner");
  const [cc, ai, score, base] = await Promise.all([commandCenterAccess(), anthropicKey(), readScore("this", todayInDetroit()), appBase()]);
  return (
    <div className="space-y-6">
      <PageTitle>Settings</PageTitle>

      <section className="space-y-2.5">
        <ListTitle>Connections</ListTitle>
        <ConnectionForms
          cc={cc ? { set: true, fromEnv: cc.source === "env", host: new URL(cc.url).host } : { set: false, fromEnv: false, host: "" }}
          ai={ai ? { set: true, fromEnv: ai.source === "env", model: MODEL } : { set: false, fromEnv: false, model: MODEL }}
        />
        <ListCard>
          <li className="flex items-center gap-3 px-4 py-3.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${score ? "bg-green-700" : "bg-gray-300"}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-gray-900">Scorecard</span>
              <span className="block text-[13px] text-gray-500">{score ? `Reading this month: ${formatDollars(score.totalCents)} so far` : "Not reachable: the Scorecard slide is skipped."}</span>
            </span>
          </li>
        </ListCard>
      </section>

      <section className="space-y-2.5">
        <ListTitle>The TV</ListTitle>
        <div className="rounded-[22px] bg-surface p-4 shadow-card">
          <p className="text-[14px] leading-snug text-gray-700">On the office TV, open this address and sign in once with the team password:</p>
          <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2.5 font-mono text-[15px] font-semibold break-all text-gray-900 select-all">{base ? `${base}/tv` : "/tv"}</p>
          <p className="mt-2 text-[13px] text-gray-500">Press F there for full screen. It waits quietly until you press Play.</p>
        </div>
      </section>

      <section className="space-y-2.5">
        <ListTitle>Slides</ListTitle>
        <ListCard>
          <li>
            <Link href="/layouts" className="flex items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-gray-900">The 12 layouts</span>
                <span className="block text-[13px] text-gray-500">Your approved slide brand, one sample each</span>
              </span>
              <RowChevron />
            </Link>
          </li>
        </ListCard>
      </section>
    </div>
  );
}
