"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CONTENT_LAYOUTS,
  ICONS,
  LAYOUT_LABEL,
  LAYOUT_USE,
  MAX_ROWS,
  PEOPLE,
  TIER_KINDS,
  limitNotes,
  switchLayout,
  type ContentLayout,
  type ContentSlide,
  type DrawnSlide,
} from "@/lib/slides";
import type { Item } from "@/lib/types";
import { SlideBox } from "@/components/slides/slide";
import { Switch } from "@/components/switch";
import { Button, Input, Label, Notice, Select, Textarea, cn } from "@/components/ui";
import { toast } from "@/components/toaster";
import { redraftItem, saveItem, setIncluded } from "../../actions";

/**
 * One thought's slide(s): the live preview at the top, the layout picker, the words, Save. The
 * preview is the same component the TV draws, so what the owner sees here is what the room sees.
 */
export function Editor({ item, eyebrow, deckLength, firstIndex }: { item: Item; eyebrow: string; deckLength: number; firstIndex: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [section, setSection] = useState(item.section);
  const [slides, setSlides] = useState<ContentSlide[]>(item.slides);
  const [at, setAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const busy = item.draft_status === "pending" || item.draft_status === "drafting";

  // A fresh draft arrives: take it unless the owner is mid-edit.
  const [seen, setSeen] = useState(item.updated_at);
  if (seen !== item.updated_at) {
    setSeen(item.updated_at);
    if (!dirty) {
      setSlides(item.slides);
      setSection(item.section);
      setAt(0);
    }
  }
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  const slide = slides[Math.min(at, slides.length - 1)];
  const update = (next: ContentSlide) => {
    setSlides((all) => all.map((s, i) => (i === at ? next : s)));
    setDirty(true);
  };
  const preview: DrawnSlide | null = slide ? { ...slide, eyebrow: eyebrow || section, index: firstIndex ? firstIndex + at : undefined, total: deckLength || undefined } : null;
  const notes = slide ? limitNotes(slide) : [];

  const save = () =>
    start(async () => {
      const r = await saveItem(item.id, { section, slides });
      toast(r.ok ? (r.message ?? "Saved.") : r.error, r.ok);
      if (r.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-2 pt-1">
        <Link href="/" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-bold text-accent-text">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Next meeting
        </Link>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-gray-700">
          In the show
          <Switch checked={item.included} disabled={pending} label="In the show" onChange={(next) => start(async () => { const r = await setIncluded(item.id, next); toast(r.ok ? (r.message ?? "") : r.error, r.ok); router.refresh(); })} />
        </label>
      </div>

      <div>
        <h1 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-gray-900">{item.card.title || "A thought"}</h1>
        <button type="button" onClick={() => setShowCard((v) => !v)} className="mt-1 text-[14px] font-bold text-accent-text">
          {showCard ? "Hide what you said" : "What you said"}
        </button>
        {showCard && (
          <div className="mt-2 rounded-2xl bg-surface p-3.5 text-[14px] leading-relaxed text-gray-700 shadow-card">
            {item.card.summary && <p>{item.card.summary}</p>}
            {item.card.points.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {item.card.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {busy ? (
        <div className="flex aspect-video items-center justify-center rounded-[18px] bg-surface shadow-card">
          <div className="text-center">
            <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-accent" />
            <p className="mt-3 text-[14px] font-semibold text-gray-600">Claude is drafting this slide…</p>
          </div>
        </div>
      ) : preview ? (
        <div>
          <SlideBox slide={preview} uid={`edit-${item.id}-${at}`} className="rounded-[18px] shadow-card" label="Preview" />
          {slides.length > 1 && (
            <div className="mt-2 flex justify-center gap-1.5" role="tablist" aria-label="Slides of this thought">
              {slides.map((s, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === at} onClick={() => setAt(i)} className={cn("h-9 rounded-full px-3.5 text-[13px] font-bold", i === at ? "bg-tint text-accent-text" : "bg-gray-100 text-gray-600")}>
                  {i + 1}. {LAYOUT_LABEL[s.layout]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {item.draft_note && !busy && <Notice tone="amber">{item.draft_note}</Notice>}

      {!busy && slide && (
        <>
          <section className="space-y-2">
            <p className="px-1 text-[13px] font-bold tracking-[0.06em] text-gray-500 uppercase">Layout</p>
            <div className="grid grid-cols-2 gap-2">
              {CONTENT_LAYOUTS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => update(switchLayout(slide, l as ContentLayout))}
                  className={cn("rounded-2xl border px-3 py-2.5 text-left", slide.layout === l ? "border-accent bg-tint" : "border-line bg-surface")}
                >
                  <span className={cn("block text-[14px] font-bold", slide.layout === l ? "text-accent-text" : "text-gray-900")}>{LAYOUT_LABEL[l]}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{LAYOUT_USE[l]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-[22px] bg-surface p-4 shadow-card">
            <Field label="Section on the agenda" hint="1 to 3 words, like “Bonuses”. Thoughts with the same section sit together.">
              <Input value={section} maxLength={40} onChange={(e) => { setSection(e.target.value); setDirty(true); }} />
            </Field>
            <Fields slide={slide} onChange={update} />
            {notes.length > 0 && (
              <div className="rounded-2xl bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-900">
                <p className="font-bold">Long for the TV</p>
                <ul className="mt-1 list-disc pl-4">
                  {notes.map((n, i) => (
                    <li key={i}>
                      {fieldName(n.field)}: {n.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Field label="Speaker notes" hint="Shows on your phone while you present. The room doesn't see them.">
              <Textarea rows={4} value={slide.notes} onChange={(e) => update({ ...slide, notes: e.target.value })} />
            </Field>
          </section>

          <div className="flex flex-wrap gap-2">
            {slides.length < 2 ? (
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => { setSlides([...slides, switchLayout(slide, "big_number")]); setAt(slides.length); setDirty(true); }}>
                Add a second slide
              </Button>
            ) : (
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => { setSlides(slides.filter((_, i) => i !== at)); setAt(0); setDirty(true); }}>
                Remove this slide
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl"
              disabled={pending}
              onClick={() => {
                if (dirty && !window.confirm("Replace your changes with a new draft from Claude?")) return;
                start(async () => {
                  const r = await redraftItem(item.id);
                  toast(r.ok ? (r.message ?? "") : r.error, r.ok);
                  setDirty(false);
                  router.refresh();
                });
              }}
            >
              Redo with Claude
            </Button>
          </div>
        </>
      )}

      {!busy && (
        <div className="fixed inset-x-0 z-30 flex justify-center px-4" style={{ bottom: "calc(var(--tabbar-h, 0px) + max(14px, env(safe-area-inset-bottom, 0px)) + 6px)" }}>
          <Button type="button" className="h-12 w-full max-w-md rounded-2xl text-[16px] shadow-float" disabled={pending || !dirty} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}

const FIELD_NAMES: Record<string, string> = { statement: "The statement", line: "The line", title: "Title", number: "The number", label: "Label", note: "Note", takeaway: "Takeaway", rule: "Rule line", strip: "The strip" };
function fieldName(field: string): string {
  const [head, i, sub] = field.split(".");
  if (i == null) return FIELD_NAMES[head] ?? head;
  const n = Number(i) + 1;
  const what = { lines: "Line", math: "Math line", cards: "Card", steps: "Step", rows: "Row" }[head] ?? head;
  return `${what} ${n}${sub ? ` ${sub}` : ""}`;
}

/** A labelled group: the label names every control inside it (one input, or a list of them). */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-l`} aria-describedby={hint ? `${id}-h` : undefined}>
      <Label id={`${id}-l`} className="font-semibold">
        {label}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-h`} className="mt-1 text-[12px] leading-snug text-gray-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function Counted({ value, max, onChange, placeholder }: { value: string; max: number; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="pr-12" />
      <span className={cn("pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[12px]", value.replace(/\*\*/g, "").length > max ? "font-bold text-amber-700" : "text-gray-400")}>
        {value.replace(/\*\*/g, "").length}/{max}
      </span>
    </div>
  );
}

/** A list of short lines (talking lines, math lines) with add and remove. */
function Lines({ values, max, rows, onChange, placeholder }: { values: string[]; max: number; rows: number; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Counted value={v} max={max} placeholder={placeholder} onChange={(next) => onChange(values.map((x, k) => (k === i ? next : x)))} />
          </div>
          <RemoveButton onClick={() => onChange(values.filter((_, k) => k !== i))} />
        </div>
      ))}
      {values.length < rows && <AddButton onClick={() => onChange([...values, ""])} />}
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function AddButton({ onClick, label = "Add a line" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="h-10 rounded-full px-3 text-[14px] font-bold text-accent-text hover:bg-tint">
      + {label}
    </button>
  );
}

const ICON_LABEL: Record<(typeof ICONS)[number], string> = { headphones: "Headphones", mini_pc: "Mini PC", keyboard: "Keyboard", mouse: "Mouse", monitor: "Monitor", none: "No icon" };
const PERSON_LABEL: Record<(typeof PEOPLE)[number], string> = { owner: "Me (AK)", mark: "Mark (MD)", teammate: "A teammate", none: "Not a person" };
const TIER_LABEL: Record<(typeof TIER_KINDS)[number], string> = { owner: "Me", team: "People here now", open: "Seats not filled yet" };

function Fields({ slide, onChange }: { slide: ContentSlide; onChange: (s: ContentSlide) => void }) {
  switch (slide.layout) {
    case "big_news":
      return (
        <>
          <Field label="The news" hint="One decided announcement, ending with a period.">
            <Counted value={slide.statement} max={30} onChange={(v) => onChange({ ...slide, statement: v })} />
          </Field>
          <Field label="The line under it">
            <Counted value={slide.line} max={58} onChange={(v) => onChange({ ...slide, line: v })} />
          </Field>
        </>
      );
    case "key_line":
      return (
        <>
          <Field label="The line to remember" hint="Two short lines; press return where the line breaks.">
            <Textarea rows={2} value={slide.statement} onChange={(e) => onChange({ ...slide, statement: e.target.value.split("\n").slice(0, 2).join("\n") })} />
          </Field>
          <Field label="The coral word" hint="One word from it that carries the idea.">
            <Input value={slide.coral} onChange={(e) => onChange({ ...slide, coral: e.target.value })} />
          </Field>
          <Field label="The line under it">
            <Counted value={slide.line} max={58} onChange={(v) => onChange({ ...slide, line: v })} />
          </Field>
        </>
      );
    case "big_number":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="The number" hint="Write [X] if not decided.">
              <Counted value={slide.number} max={5} onChange={(v) => onChange({ ...slide, number: v })} />
            </Field>
            <Field label="Under it">
              <Input value={slide.label} onChange={(e) => onChange({ ...slide, label: e.target.value })} />
            </Field>
          </div>
          <Field label="Not decided yet" hint="Ends with “ · TBD”. Leave empty when nothing is open.">
            <Input value={slide.pill} onChange={(e) => onChange({ ...slide, pill: e.target.value })} />
          </Field>
          <Field label="Lines" hint="Wrap the key words in **double stars** to make them bold.">
            <Lines values={slide.lines} max={34} rows={MAX_ROWS.bigNumberLines} onChange={(lines) => onChange({ ...slide, lines })} />
          </Field>
        </>
      );
    case "chart":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <Field label="Question for the room" hint="Optional.">
            <Input value={slide.subtitle} onChange={(e) => onChange({ ...slide, subtitle: e.target.value })} />
          </Field>
          <Field label="Slices" hint="Sizes add up to 100. The highlighted one is coral.">
            <div className="space-y-2">
              {slide.slices.map((x, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="hi"
                    aria-label="Highlight"
                    checked={x.highlight}
                    onChange={() => onChange({ ...slide, slices: slide.slices.map((y, k) => ({ ...y, highlight: k === i })) })}
                    className="h-5 w-5 accent-[var(--t-accent)]"
                  />
                  <Input type="number" inputMode="numeric" className="w-20" value={x.share} onChange={(e) => onChange({ ...slide, slices: slide.slices.map((y, k) => (k === i ? { ...y, share: Number(e.target.value) || 0 } : y)) })} />
                  <Input placeholder="Label (optional)" value={x.label} onChange={(e) => onChange({ ...slide, slices: slide.slices.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })} />
                  {slide.slices.length > 2 && <RemoveButton onClick={() => onChange({ ...slide, slices: slide.slices.filter((_, k) => k !== i) })} />}
                </div>
              ))}
              {slide.slices.length < MAX_ROWS.chartSlices && <AddButton label="Add a slice" onClick={() => onChange({ ...slide, slices: [...slide.slices, { share: 10, label: "", highlight: false }] })} />}
            </div>
          </Field>
          <Field label="Middle of the ring" hint="“You” when it names the reader.">
            <Input value={slide.center} onChange={(e) => onChange({ ...slide, center: e.target.value })} />
          </Field>
          <Field label="Math lines" hint="Start the 2nd and 3rd with ÷, = or “or”.">
            <Lines values={slide.math} max={36} rows={MAX_ROWS.chartMath} onChange={(math) => onChange({ ...slide, math })} />
          </Field>
          <Field label="Line under the math">
            <Input value={slide.note} onChange={(e) => onChange({ ...slide, note: e.target.value })} />
          </Field>
          <Field label="Not decided yet" hint="Ends with “ · TBD”.">
            <Input value={slide.pill} onChange={(e) => onChange({ ...slide, pill: e.target.value })} />
          </Field>
        </>
      );
    case "diagram":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <Field label="Tiers, left to right">
            <div className="space-y-2">
              {slide.tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select className="w-36 shrink-0" value={t.kind} onChange={(e) => onChange({ ...slide, tiers: slide.tiers.map((y, k) => (k === i ? { ...y, kind: e.target.value as typeof t.kind } : y)) })}>
                    {TIER_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {TIER_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <Input value={t.label} onChange={(e) => onChange({ ...slide, tiers: slide.tiers.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })} />
                  <Input type="number" inputMode="numeric" className="w-16 shrink-0" value={t.count} aria-label="How many" onChange={(e) => onChange({ ...slide, tiers: slide.tiers.map((y, k) => (k === i ? { ...y, count: Number(e.target.value) || 1 } : y)) })} />
                  {slide.tiers.length > 2 && <RemoveButton onClick={() => onChange({ ...slide, tiers: slide.tiers.filter((_, k) => k !== i) })} />}
                </div>
              ))}
              {slide.tiers.length < MAX_ROWS.tiers && <AddButton label="Add a tier" onClick={() => onChange({ ...slide, tiers: [...slide.tiers, { kind: "open", label: "", count: 6 }] })} />}
            </div>
          </Field>
          <Field label="Rule line">
            <Input value={slide.rule} onChange={(e) => onChange({ ...slide, rule: e.target.value })} />
          </Field>
          <Field label="Takeaway">
            <Counted value={slide.takeaway} max={58} onChange={(v) => onChange({ ...slide, takeaway: v })} />
          </Field>
        </>
      );
    case "price_cards":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <Field label="Line under the title">
            <Input value={slide.subtitle} onChange={(e) => onChange({ ...slide, subtitle: e.target.value })} />
          </Field>
          <Field label="Cards" hint="Tap the star on the one number to look at.">
            <div className="space-y-2">
              {slide.cards.map((c, i) => (
                <div key={i} className="space-y-1.5 rounded-2xl bg-gray-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <Input className="w-28 shrink-0 font-mono" value={c.number} onChange={(e) => onChange({ ...slide, cards: slide.cards.map((y, k) => (k === i ? { ...y, number: e.target.value } : y)) })} />
                    <Input placeholder="Label" value={c.label} onChange={(e) => onChange({ ...slide, cards: slide.cards.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })} />
                    {slide.cards.length > 1 && <RemoveButton onClick={() => onChange({ ...slide, cards: slide.cards.filter((_, k) => k !== i) })} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={c.icon} onChange={(e) => onChange({ ...slide, cards: slide.cards.map((y, k) => (k === i ? { ...y, icon: e.target.value as typeof c.icon } : y)) })}>
                      {ICONS.map((k) => (
                        <option key={k} value={k}>
                          {ICON_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      aria-pressed={c.highlight}
                      onClick={() => onChange({ ...slide, cards: slide.cards.map((y, k) => ({ ...y, highlight: k === i ? !y.highlight : false })) })}
                      className={cn("h-11 shrink-0 rounded-full px-3.5 text-[13px] font-bold", c.highlight ? "bg-tint text-accent-text" : "bg-gray-100 text-gray-600")}
                    >
                      ★ {c.highlight ? "Look here" : "Plain"}
                    </button>
                  </div>
                </div>
              ))}
              {slide.cards.length < MAX_ROWS.cards && <AddButton label="Add a card" onClick={() => onChange({ ...slide, cards: [...slide.cards, { icon: "none", number: "", label: "", highlight: false }] })} />}
            </div>
          </Field>
          <Field label="Strip under the cards" hint="Optional.">
            <Input value={slide.strip} onChange={(e) => onChange({ ...slide, strip: e.target.value })} />
          </Field>
        </>
      );
    case "step_chain":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <Field label="Line under the title">
            <Input value={slide.subtitle} onChange={(e) => onChange({ ...slide, subtitle: e.target.value })} />
          </Field>
          <Field label="Steps, in order">
            <div className="space-y-2">
              {slide.steps.map((st, i) => (
                <div key={i} className="space-y-1.5 rounded-2xl bg-gray-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-center font-mono text-[15px] font-bold text-gray-500">{i + 1}</span>
                    <Counted value={st.name} max={20} onChange={(v) => onChange({ ...slide, steps: slide.steps.map((y, k) => (k === i ? { ...y, name: v } : y)) })} />
                    {slide.steps.length > 1 && <RemoveButton onClick={() => onChange({ ...slide, steps: slide.steps.filter((_, k) => k !== i) })} />}
                  </div>
                  <Input placeholder="Side note (optional)" value={st.note} onChange={(e) => onChange({ ...slide, steps: slide.steps.map((y, k) => (k === i ? { ...y, note: e.target.value } : y)) })} />
                  <div className="flex items-center gap-2">
                    <Select value={st.person} onChange={(e) => onChange({ ...slide, steps: slide.steps.map((y, k) => (k === i ? { ...y, person: e.target.value as typeof st.person } : y)) })}>
                      {PEOPLE.map((p) => (
                        <option key={p} value={p}>
                          {PERSON_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                    {i === slide.steps.length - 1 && (
                      <label className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-gray-700">
                        <input type="checkbox" className="h-5 w-5 accent-[var(--t-accent)]" checked={st.last_resort} onChange={(e) => onChange({ ...slide, steps: slide.steps.map((y, k) => (k === i ? { ...y, last_resort: e.target.checked } : y)) })} />
                        Last resort
                      </label>
                    )}
                  </div>
                </div>
              ))}
              {slide.steps.length < MAX_ROWS.steps && <AddButton label="Add a step" onClick={() => onChange({ ...slide, steps: [...slide.steps.map((y) => ({ ...y, last_resort: false })), { name: "", note: "", person: "none", last_resort: false }] })} />}
            </div>
          </Field>
        </>
      );
    case "script":
      return (
        <>
          <Field label="Title">
            <Counted value={slide.title} max={34} onChange={(v) => onChange({ ...slide, title: v })} />
          </Field>
          <Field label="Line under the title">
            <Input value={slide.subtitle} onChange={(e) => onChange({ ...slide, subtitle: e.target.value })} />
          </Field>
          <Field label="Rows" hint="You: your words, no quote marks. Client: what they do, like “They tell you.”">
            <div className="space-y-2">
              {slide.rows.map((r, i) => (
                <div key={i} className="space-y-1.5 rounded-2xl bg-gray-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <Select className="w-28 shrink-0" value={r.who} onChange={(e) => onChange({ ...slide, rows: slide.rows.map((y, k) => (k === i ? { ...y, who: e.target.value as "rep" | "client" } : y)) })}>
                      <option value="rep">You</option>
                      <option value="client">Client</option>
                    </Select>
                    <Input placeholder="Aside (optional)" value={r.aside} onChange={(e) => onChange({ ...slide, rows: slide.rows.map((y, k) => (k === i ? { ...y, aside: e.target.value } : y)) })} />
                    {slide.rows.length > 1 && <RemoveButton onClick={() => onChange({ ...slide, rows: slide.rows.filter((_, k) => k !== i) })} />}
                  </div>
                  <Textarea rows={2} value={r.text} onChange={(e) => onChange({ ...slide, rows: slide.rows.map((y, k) => (k === i ? { ...y, text: e.target.value } : y)) })} />
                </div>
              ))}
              {slide.rows.length < MAX_ROWS.scriptRows && <AddButton label="Add a row" onClick={() => onChange({ ...slide, rows: [...slide.rows, { who: "rep", text: "", aside: "" }] })} />}
            </div>
          </Field>
        </>
      );
  }
}
