import type { Metadata } from "next";
import { requirePage } from "@/lib/auth";
import { SAMPLE_DECK } from "@/lib/sample-deck";
import { LAYOUT_LABEL, slideHeadline } from "@/lib/slides";
import { SlideBox } from "@/components/slides/slide";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "The 12 layouts" };

/** The approved sample deck, one slide per layout: what every meeting slide is built from. */
export default async function LayoutsPage() {
  await requirePage("owner");
  return (
    <div>
      <PageTitle sub="Your approved slide brand (Nov 4). Every slide uses one of these.">The 12 layouts</PageTitle>
      <div className="grid gap-5 sm:grid-cols-2">
        {SAMPLE_DECK.map((s, i) => (
          <figure key={i} data-layout={s.layout}>
            <SlideBox slide={s} uid={`layout-${i}`} className="rounded-[14px] shadow-card" label={slideHeadline(s)} />
            <figcaption className="mt-2 px-1 text-[14px] font-bold text-gray-900">
              {String(i + 1).padStart(2, "0")} · {LAYOUT_LABEL[s.layout]}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
