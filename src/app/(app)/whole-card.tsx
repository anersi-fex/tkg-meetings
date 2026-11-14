"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AskBox } from "@/components/ask-box";
import { LengthPicker } from "@/components/length-picker";
import { toast } from "@/components/toaster";
import { isNoConnection, isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import type { Length } from "@/lib/pocket-shape";
import type { Item } from "@/lib/types";
import { redoWholeMeeting } from "./actions";

type Whole = { rec: string; label: string; length: Length; ask: string; parts: number; slides: number };

/** The whole meetings in this meeting: one per recording, with its length and what he asked. Pure. */
export function wholeMeetingsIn(items: Item[]): Whole[] {
  const seen = new Map<string, Whole>();
  for (const i of items) {
    const w = i.card.whole;
    if (!w) continue;
    const s = seen.get(w.rec) ?? { rec: w.rec, label: w.label, length: w.length, ask: w.ask ?? "", parts: 0, slides: 0 };
    s.parts++;
    s.slides += i.slides.length || w.slides;
    seen.set(w.rec, s);
  }
  return [...seen.values()];
}

/**
 * A whole meeting made from one recording, on Next meeting: its length (Brief, Standard, Full)
 * and "Tell Claude" for the whole meeting. Changing either makes its topics and slides again.
 */
export function WholeMeetingCards({ items, live }: { items: Item[]; live: boolean }) {
  const wholes = wholeMeetingsIn(items);
  if (!wholes.length) return null;
  return (
    <>
      {wholes.map((w) => (
        <WholeCard key={w.rec} whole={w} live={live} />
      ))}
    </>
  );
}

function WholeCard({ whole, live }: { whole: Whole; live: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [length, setLength] = useState<Length>(whole.length);
  const redo = (ask: string) =>
    new Promise<boolean>((done) => {
      if (!window.confirm("Claude makes this meeting's slides again from the recording. Edits you made to them go. Go ahead?")) return done(false);
      start(async () => {
        const r = await safeAction(() => redoWholeMeeting(whole.rec, length, ask));
        if (isStale(r)) {
          const why = reloadForUpdate();
          if (why) toast(why, false);
          return done(false);
        }
        toast(r.ok ? (r.message ?? "") : r.error, r.ok);
        if (!r.ok && isNoConnection(r)) return done(false);
        router.refresh();
        done(r.ok);
      });
    });
  return (
    <AskBox
      title={`Whole meeting: ${whole.label}`}
      placeholder={'Tell Claude: "skip the part about parking", "more on the callbacks"'}
      chips={["Cut the rambling", "More detail", "Shorter", "Add an example"]}
      button={pending ? "Claude is planning… (about a minute)" : "Make it again"}
      disabled={pending || live}
      onAsk={redo}
    >
      <p className="text-[13px] text-gray-500">
        From one recording: {whole.parts} topics, {whole.slides} slides.{live ? " Pause the show to change it." : ""}
      </p>
      <LengthPicker value={length} onChange={setLength} />
      {length !== whole.length && (
        <button type="button" disabled={pending || live} onClick={() => void redo(whole.ask)} className="min-h-11 w-full rounded-2xl bg-tint text-[14px] font-extrabold text-accent-text disabled:opacity-50">
          {pending ? "Claude is planning…" : `Make it ${length}`}
        </button>
      )}
    </AskBox>
  );
}
