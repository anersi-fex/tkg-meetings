import { LAYOUT_LABEL, slideHeadline, type DrawnSlide } from "@/lib/slides";
import { SlideBox } from "@/components/slides/slide";

/** A whole deck on a phone: every slide as the TV draws it, its number, its layout and its notes. */
export function DeckList({ slides, uidPrefix }: { slides: DrawnSlide[]; uidPrefix: string }) {
  return (
    <ol className="space-y-6">
      {slides.map((s, i) => (
        <li key={i}>
          <SlideBox slide={s} uid={`${uidPrefix}-${i}`} className="rounded-[14px] shadow-card" label={slideHeadline(s)} />
          <div className="mt-2 px-1">
            <p className="text-[13px] font-bold text-gray-500">
              <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> · {LAYOUT_LABEL[s.layout]}
            </p>
            {s.notes ? <p className="mt-1 text-[14px] leading-relaxed text-gray-700">{s.notes}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
