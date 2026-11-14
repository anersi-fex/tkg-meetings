"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BuiltDeck } from "@/lib/deck";
import type { SyncResult } from "@/lib/meeting";
import type { Item, Meeting, ScoreboardMonth } from "@/lib/types";
import { LAYOUT_LABEL, slideHeadline, type DrawnSlide } from "@/lib/slides";
import { SlideBox } from "@/components/slides/slide";
import { Switch } from "@/components/switch";
import { Sheet } from "@/components/sheet";
import { ListCard, ListTitle, RowChevron } from "@/components/tide";
import { Badge, Button, Input, Label, Notice, cn } from "@/components/ui";
import { toast } from "@/components/toaster";
import { dayLabel } from "@/lib/month";
import {
  moveItem,
  playOnTv,
  refreshFromCommandCenter,
  setCover,
  setIncluded,
  setMeetingDate,
  setQuote,
  setScoreboard,
  type ActionResult,
} from "./actions";

/**
 * Next meeting: the thoughts Command Center filed for the team meeting, each with its slide, a
 * switch (in the show or not) and its place in the order; the cover, the Scorecard slide and the
 * closing quote; Play on the TV. Built for one thumb on an iPhone.
 */
export function NextMeeting({ meeting, items, deck, sync, hasAi }: { meeting: Meeting; items: Item[]; deck: BuiltDeck; sync: SyncResult; hasAi: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ordering, setOrdering] = useState(false);
  const [sheet, setSheet] = useState<"date" | "cover" | "quote" | null>(null);

  const drafting = items.some((i) => i.draft_status === "pending" || i.draft_status === "drafting");
  // While Claude drafts, look again every few seconds.
  useEffect(() => {
    if (!drafting) return;
    const t = setInterval(() => router.refresh(), 3500);
    return () => clearInterval(t);
  }, [drafting, router]);

  const shown = items.filter((i) => i.included);
  const slideOf = useMemo(() => {
    const map = new Map<string, DrawnSlide>();
    deck.itemOfSlide.forEach((id, i) => {
      if (id && !map.has(id)) map.set(id, deck.slides[i]);
    });
    return map;
  }, [deck]);
  const scoreSlide = deck.slides.find((s) => s.layout === "scoreboard");

  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok || r.message) toast(r.ok ? r.message! : r.error, r.ok);
      after?.(r);
      router.refresh();
    });

  const live = meeting.status === "live";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] text-gray-900">Next meeting</h1>
          <p className="mt-1 text-[14px] font-medium text-gray-500">
            {items.length ? `${shown.length} of ${items.length} in the show` : "Nothing in the Team meeting folder yet"}
            {deck.slides.length > 1 && shown.length ? ` · ${deck.slides.length} slides` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet("date")}
          className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold", meeting.meets_on ? "bg-tint text-accent-text" : "bg-amber-100 text-amber-800")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
          {meeting.meets_on ? dayLabel(meeting.meets_on) : "Set a date"}
        </button>
      </div>

      {live && (
        <div className="flex items-center gap-3 rounded-[22px] bg-tide-strong p-4 text-white shadow-glow">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          <p className="min-w-0 flex-1 text-[15px] font-bold">
            Live on the TV · slide {meeting.current_slide + 1} of {meeting.deck?.length ?? 0}
          </p>
          <Link href="/present" className="inline-flex h-10 items-center rounded-full bg-white/20 px-4 text-[14px] font-bold">
            Clicker
          </Link>
        </div>
      )}

      {!sync.ok && (
        <Notice tone="amber">
          {sync.message}{" "}
          {(sync.kind === "not_connected" || sync.kind === "unauthorized") && (
            <Link href="/settings" className="font-bold underline">
              Connect it in Settings
            </Link>
          )}
        </Notice>
      )}
      {!hasAi && items.length > 0 && (
        <Notice tone="blue">
          Slides are plain Key lines until Claude is connected.{" "}
          <Link href="/settings" className="font-bold underline">
            Add the key in Settings
          </Link>
        </Notice>
      )}
      {deck.warnings.map((w) => (
        <Notice key={w} tone="amber">
          {w}
        </Notice>
      ))}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <ListTitle count={items.length}>Thoughts</ListTitle>
          <div className="flex items-center gap-1">
            {items.length > 1 && (
              <button type="button" onClick={() => setOrdering((v) => !v)} className={cn("h-10 rounded-full px-3.5 text-[14px] font-bold", ordering ? "bg-tint text-accent-text" : "text-gray-600 hover:bg-gray-100")}>
                {ordering ? "Done" : "Order"}
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => run(refreshFromCommandCenter)} className="h-10 rounded-full px-3.5 text-[14px] font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
              Refresh
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[22px] bg-surface px-5 py-8 text-center shadow-card">
            <p className="text-[16px] font-bold text-gray-900">Nothing for the team meeting yet</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[14px] leading-snug text-gray-600">
              Say &ldquo;for the team meeting&rdquo; in Pocket and the thought lands here, as a slide.
            </p>
          </div>
        ) : (
          <ListCard>
            {items.map((item, i) => {
              const slide = slideOf.get(item.id) ?? (item.slides[0] ? ({ ...item.slides[0], eyebrow: item.section } as DrawnSlide) : null);
              const busy = item.draft_status === "pending" || item.draft_status === "drafting";
              return (
                <li key={item.id} className="relative not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:h-px not-first:before:bg-line">
                  <div className="flex items-center gap-3 px-3 py-3">
                    {ordering ? (
                      <div className="flex shrink-0 flex-col">
                        <button type="button" aria-label="Move up" disabled={pending || i === 0} onClick={() => run(() => moveItem(item.id, "up"))} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M6 15l6-6 6 6" />
                          </svg>
                        </button>
                        <button type="button" aria-label="Move down" disabled={pending || i === items.length - 1} onClick={() => run(() => moveItem(item.id, "down"))} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                    <Link href={`/item/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={cn("w-[104px] shrink-0 overflow-hidden rounded-[10px] ring-1 ring-line", !item.included && "opacity-45")}>
                        {busy || !slide ? (
                          <div className="flex aspect-video items-center justify-center bg-gray-100">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-accent" aria-label="Drafting" />
                          </div>
                        ) : (
                          <SlideBox slide={slide} uid={`row-${item.id}`} label={slideHeadline(slide)} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("line-clamp-2 text-[15px] leading-snug font-bold", item.included ? "text-gray-900" : "text-gray-500")}>{item.card.title || "A thought"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {busy ? (
                            <Badge tone="gray">Drafting…</Badge>
                          ) : (
                            <>
                              {item.section && <Badge tone="blue">{item.section}</Badge>}
                              {item.slides[0] && <span className="text-[12px] font-semibold text-gray-500">{LAYOUT_LABEL[item.slides[0].layout]}{item.slides.length > 1 ? " +1" : ""}</span>}
                            </>
                          )}
                          {item.draft_note && !busy && <Badge tone="amber">Check</Badge>}
                          {!item.card.open && <Badge tone="gray">Closed in Command Center</Badge>}
                        </div>
                      </div>
                    </Link>
                    <Switch checked={item.included} disabled={pending} label={`${item.card.title}: in the show`} onChange={(next) => run(() => setIncluded(item.id, next))} />
                  </div>
                </li>
              );
            })}
          </ListCard>
        )}
        <p className="flex items-start gap-2 px-1 text-[13px] leading-snug text-gray-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-accent-text" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          Tap a thought to change its slide. Say &ldquo;for the team meeting&rdquo; in Pocket to add one.
        </p>
      </section>

      <section className="space-y-2.5">
        <ListTitle>Around it</ListTitle>
        <ListCard>
          <li>
            <button type="button" onClick={() => setSheet("cover")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-gray-900">Cover</span>
                <span className="block truncate text-[13px] text-gray-500">{meeting.title} · {deck.slides[0]?.layout === "cover" ? deck.slides[0].line : ""}</span>
              </span>
              <RowChevron />
            </button>
          </li>
          <li className="relative before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-gray-900">Scorecard slide</span>
                <span className="block truncate text-[13px] text-gray-500">
                  {meeting.scoreboard
                    ? scoreSlide && scoreSlide.layout === "scoreboard"
                      ? `${scoreSlide.eyebrow.split(" · ")[0]}: ${scoreSlide.number}${scoreSlide.pill ? ` · ${scoreSlide.pill}` : ""}`
                      : "Scorecard didn't answer: the slide is skipped."
                    : "Off"}
                </span>
              </span>
              <Switch checked={meeting.scoreboard} disabled={pending} label="Scorecard slide" onChange={(next) => run(() => setScoreboard(next, meeting.scoreboard_month))} />
            </div>
            {meeting.scoreboard && (
              <div className="flex gap-1 px-4 pb-3" role="group" aria-label="Which month">
                {(["auto", "this", "last"] as ScoreboardMonth[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setScoreboard(true, m))}
                    className={cn("h-9 flex-1 rounded-full text-[13px] font-bold", meeting.scoreboard_month === m ? "bg-tint text-accent-text" : "bg-gray-100 text-gray-600")}
                  >
                    {m === "auto" ? "Auto" : m === "this" ? "This month" : "Last month"}
                  </button>
                ))}
              </div>
            )}
          </li>
          <li className="relative before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line">
            <button type="button" onClick={() => setSheet("quote")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-gray-900">Closing quote</span>
                <span className="block truncate text-[13px] text-gray-500">{meeting.quote ? `“${meeting.quote.text}”` : "None: the deck ends on the last thought"}</span>
              </span>
              <RowChevron />
            </button>
          </li>
        </ListCard>
      </section>

      <div className="space-y-2.5 pt-1">
        <Button
          type="button"
          className="h-14 w-full rounded-2xl text-[17px]"
          disabled={pending || (!live && !shown.length)}
          onClick={() =>
            live
              ? router.push("/present")
              : run(playOnTv, (r) => {
                  if (r.ok) router.push("/present");
                })
          }
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
            <path d="M8 21h8M12 17v4M10 8.5v5l4-2.5z" />
          </svg>
          {live ? "Open the clicker" : "Play on the TV"}
        </Button>
        {shown.length > 0 && (
          <Link href="/deck" className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-bold text-accent-text hover:bg-tint">
            Preview all {deck.slides.length} slides
          </Link>
        )}
      </div>

      {sheet === "date" && <DateSheet value={meeting.meets_on ?? ""} onClose={() => setSheet(null)} onSave={(v) => run(() => setMeetingDate(v), () => setSheet(null))} />}
      {sheet === "cover" && <CoverSheet title={meeting.title} line={meeting.cover_line} auto={deck.slides[0]?.layout === "cover" && !meeting.cover_line ? deck.slides[0].line : ""} onClose={() => setSheet(null)} onSave={(t, l) => run(() => setCover(t, l), () => setSheet(null))} />}
      {sheet === "quote" && (
        <QuoteSheet
          items={items.filter((i) => i.included && i.quote_candidates.length)}
          current={meeting.quote?.text ?? null}
          onClose={() => setSheet(null)}
          onPick={(itemId, idx) => run(() => setQuote(itemId, idx), () => setSheet(null))}
        />
      )}
    </div>
  );
}

function DateSheet({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title="Meeting date" onClose={onClose}>
      <Label htmlFor="meets-on">The day of the meeting</Label>
      <Input id="meets-on" type="date" value={v} onChange={(e) => setV(e.target.value)} />
      <div className="mt-4 flex gap-2">
        {value && (
          <Button type="button" variant="secondary" className="flex-1 rounded-2xl" onClick={() => onSave("")}>
            Clear
          </Button>
        )}
        <Button type="button" className="flex-1 rounded-2xl" onClick={() => onSave(v)} disabled={!v}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}

function CoverSheet({ title, line, auto, onClose, onSave }: { title: string; line: string; auto: string; onClose: () => void; onSave: (t: string, l: string) => void }) {
  const [t, setT] = useState(title);
  const [l, setL] = useState(line);
  return (
    <Sheet title="Cover" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(t, l);
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="cover-title">Title</Label>
          <Input id="cover-title" value={t} maxLength={40} onChange={(e) => setT(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cover-line">The line under it</Label>
          <Input id="cover-line" value={l} maxLength={120} placeholder={auto || "Made from the topics"} onChange={(e) => setL(e.target.value)} />
          <p className="mt-1 text-[12px] text-gray-500">Leave it empty and it lists the topics. 10 words at most.</p>
        </div>
        <Button type="submit" className="w-full rounded-2xl">
          Save
        </Button>
      </form>
    </Sheet>
  );
}

function QuoteSheet({ items, current, onClose, onPick }: { items: Item[]; current: string | null; onClose: () => void; onPick: (itemId: string | null, idx: number | null) => void }) {
  return (
    <Sheet title="Closing quote" onClose={onClose}>
      <p className="mb-3 text-[13px] leading-snug text-gray-600">Only lines you said word for word can close the meeting. They show here when a thought has one.</p>
      <div className="space-y-2">
        <button type="button" onClick={() => onPick(null, null)} className={cn("w-full rounded-2xl border px-3.5 py-3 text-left text-[15px] font-semibold", current ? "border-line text-gray-700" : "border-accent bg-tint text-accent-text")}>
          No closing quote
        </button>
        {items.flatMap((item) =>
          item.quote_candidates.map((q, idx) => (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              onClick={() => onPick(item.id, idx)}
              className={cn("w-full rounded-2xl border px-3.5 py-3 text-left", current === q ? "border-accent bg-tint" : "border-line")}
            >
              <span className="block text-[15px] leading-snug font-bold text-gray-900">“{q}”</span>
              <span className="mt-0.5 block text-[12px] text-gray-500">From: {item.card.title}</span>
            </button>
          )),
        )}
        {!items.length && <p className="rounded-2xl bg-gray-50 px-3.5 py-3 text-[14px] text-gray-600">None of the thoughts in the show has a line you said word for word yet.</p>}
      </div>
    </Sheet>
  );
}
