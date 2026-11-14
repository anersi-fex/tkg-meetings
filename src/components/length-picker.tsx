"use client";

import { cn } from "@/components/ui";
import { WHOLE_LENGTHS, type Length } from "@/lib/pocket-shape";

const NAME: Record<Length, string> = { brief: "Brief", standard: "Standard", full: "Full" };

/** Brief / Standard / Full, with the number of slides each makes. */
export function LengthPicker({ value, onChange }: { value: Length; onChange: (l: Length) => void }) {
  return (
    <div role="radiogroup" aria-label="How long" className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
      {(Object.keys(WHOLE_LENGTHS) as Length[]).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onChange(l)}
          className={cn("min-h-11 rounded-lg px-1 text-center leading-tight", value === l ? "bg-surface text-accent-text shadow-card" : "text-gray-600")}
        >
          <span className="block text-[14px] font-bold">{NAME[l]}</span>
          <span className="block text-[11px] font-medium">
            {WHOLE_LENGTHS[l].slides[0]}–{WHOLE_LENGTHS[l].slides[1]} slides
          </span>
        </button>
      ))}
    </div>
  );
}
