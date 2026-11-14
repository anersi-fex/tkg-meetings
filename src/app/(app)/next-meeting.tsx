"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BuiltDeck } from "@/lib/deck";
import type { SyncResult } from "@/lib/meeting";
import type { Item, Meeting, ScoreboardMonth } from "@/lib/types";
import { LAYOUT_LABEL, coverNotes, slideHeadline, type DrawnSlide } from "@/lib/slides";
import { SlideBox } from "@/components/slides/slide";
import { Switch } from "@/components/switch";
import { Sheet } from "@/components/sheet";
import { ListCard, ListTitle, RowChevron } from "@/components/tide";
import { Badge, Button, Input, Label, Notice, cn } from "@/components/ui";
import { toast } from "@/components/toaster";
import { dayLabel } from "@/lib/month";
import { isNoConnection, safeAction } from "@/lib/safe-action";
import { EndMeetingSheet } from "./present/clicker";
import {
  moveItem,
  playOnTv,
  refreshFromCommandCenter,
  restartShow,
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
 * closing quote; Play on the TV (Resume after a pause), and End meeting when the TV isn't on.
 * Built for one thumb on an iPhone.
 */
export function NextMeeting({ meeting, items, deck, sync, hasAi }: { meeting: Meeting; items: Item[]; deck: BuiltDeck; sync: SyncResult; hasAi: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ordering, setOrdering] = useState(false);
  const [sheet, setSheet] = useState<"date" | "cover" | "quote" | "end" | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const drafting = items.some((i) => i.draft_status === "pending" || i.draft_status === "drafting");
  // While Claude drafts, look again every few seconds (not while the phone is offline: a refresh
  // that can't reach the server reloads the whole page and would wipe what is being typed).
  useEffect(() => {
    if (!drafting) return;
    const t = setInterval(() => {
      if (navigator.onLine !== false) router.refresh();
    }, 3500);
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
      const r = await safeAction(fn);
      if (!r.ok || r.message) toast(r.ok ? r.message! : r.error, r.ok);
      after?.(r);
      if (!isNoConnection(r)) router.refresh();
    });

  const openSheet = (which: "date" | "cover" | "quote" | "end") => {
    setSheetError(null);
    setSheet(which);
  };
  const closeSheet = () => {
    setSheetError(null);
    setSheet(null);
  };
  // A sheet's save: it closes only when the save went through; otherwise it stays open with what
  // he typed and says why, inside the sheet (the toast would sit under the dimmed backdrop).
  const runSheet = (fn: () => Promise<ActionResult>) => {
    setSheetError(null);
    start(async () => {
      const r = await safeAction(fn);
      if (r.ok) {
        setSheet(null);
        if (r.message) toast(r.message);
      } else setSheetError(r.error);
      if (!isNoConnection(r)) router.refresh();
    });
  };

  const live = meeting.status === "live";
  // Paused: played before and taken off the TV; Play picks up on the same thought.
  const paused = meeting.status === "draft" && !!meeting.started_at;
  const toClicker = (r: ActionResult) => {
    if (r.ok) router.push("/present");
  };

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
          onClick={() => openSheet("date")}
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
      {paused && (
        <div className="flex items-center gap-3 rounded-[22px] bg-surface p-4 shadow-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-accent-text" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </svg>
          <p className="min-w-0 flex-1 text-[15px] font-bold text-gray-900">
            Paused{meeting.deck?.length ? ` on slide ${Math.min(meeting.current_slide, meeting.deck.length - 1) + 1} of ${meeting.deck.length}` : ""}
          </p>
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
                    {ordering ? (
                      // In place of the switch while ordering: two thumb-sized arrows, side by side.
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" aria-label={`Move up: ${item.card.title || "this thought"}`} disabled={pending || i === 0} onClick={() => run(() => moveItem(item.id, "up"))} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M6 15l6-6 6 6" />
                          </svg>
                        </button>
                        <button type="button" aria-label={`Move down: ${item.card.title || "this thought"}`} disabled={pending || i === items.length - 1} onClick={() => run(() => moveItem(item.id, "down"))} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <Switch checked={item.included} disabled={pending} label={`${item.card.title}: in the show`} onChange={(next) => run(() => setIncluded(item.id, next))} />
                    )}
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
            <button type="button" onClick={() => openSheet("cover")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
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
                    className={cn("h-11 flex-1 rounded-full text-[13px] font-bold", meeting.scoreboard_month === m ? "bg-tint text-accent-text" : "bg-gray-100 text-gray-600")}
                  >
                    {m === "auto" ? "Auto" : m === "this" ? "This month" : "Last month"}
                  </button>
                ))}
              </div>
            )}
          </li>
          <li className="relative before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-line">
            <button type="button" onClick={() => openSheet("quote")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
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
          onClick={() => (live ? router.push("/present") : run(playOnTv, toClicker))}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
            <path d="M8 21h8M12 17v4M10 8.5v5l4-2.5z" />
          </svg>
          {live ? "Open the clicker" : paused ? "Resume on the TV" : "Play on the TV"}
        </Button>
        {paused && (
          <Button type="button" variant="secondary" className="h-12 w-full rounded-2xl text-[15px]" disabled={pending || !shown.length} onClick={() => run(restartShow, toClicker)}>
            Start from the cover
          </Button>
        )}
        {shown.length > 0 && (
          <Link href="/deck" className="flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-bold text-accent-text hover:bg-tint">
            Preview all {deck.slides.length} slides
          </Link>
        )}
      </div>

      {!live && items.length > 0 && (
        <ListCard>
          <li>
            <button type="button" onClick={() => openSheet("end")} className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-red-700">End meeting</span>
                <span className="block text-[13px] leading-snug text-gray-500">Moves it to Past. What the TV showed is marked done in Command Center.</span>
              </span>
              <RowChevron />
            </button>
          </li>
        </ListCard>
      )}

      {sheet === "date" && <DateSheet value={meeting.meets_on ?? ""} busy={pending} error={sheetError} onClose={closeSheet} onSave={(v) => runSheet(() => setMeetingDate(v))} />}
      {sheet === "cover" && (
        <CoverSheet
          title={meeting.title}
          line={meeting.cover_line}
          auto={deck.slides[0]?.layout === "cover" && !meeting.cover_line ? deck.slides[0].line : ""}
          busy={pending}
          error={sheetError}
          onClose={closeSheet}
          onSave={(t, l) => runSheet(() => setCover(t, l))}
        />
      )}
      {sheet === "quote" && (
        <QuoteSheet
          items={items.filter((i) => i.included && i.quote_candidates.length)}
          current={meeting.quote?.text ?? null}
          busy={pending}
          error={sheetError}
          onClose={closeSheet}
          onPick={(itemId, idx) => runSheet(() => setQuote(itemId, idx))}
        />
      )}
      {sheet === "end" && <EndMeetingSheet meetingId={meeting.id} live={false} onClose={closeSheet} />}
    </div>
  );
}

/** What went wrong, inside a sheet that stayed open. */
function SheetError({ error }: { error: string | null }) {
  return error ? <p className="mt-3 text-[14px] leading-snug font-semibold text-red-700">{error}</p> : null;
}

function DateSheet({ value, busy, error, onClose, onSave }: { value: string; busy: boolean; error: string | null; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title="Meeting date" onClose={onClose}>
      <Label htmlFor="meets-on">The day of the meeting</Label>
      <Input id="meets-on" type="date" value={v} onChange={(e) => setV(e.target.value)} />
      <SheetError error={error} />
      <div className="mt-4 flex gap-2">
        {value && (
          <Button type="button" variant="secondary" className="flex-1 rounded-2xl" disabled={busy} onClick={() => onSave("")}>
            Clear
          </Button>
        )}
        <Button type="button" className="flex-1 rounded-2xl" onClick={() => onSave(v)} disabled={busy || !v}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}

function CoverSheet({
  title,
  line,
  auto,
  busy,
  error,
  onClose,
  onSave,
}: {
  title: string;
  line: string;
  auto: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (t: string, l: string) => void;
}) {
  const [t, setT] = useState(title);
  const [l, setL] = useState(line);
  // Soft limits from the guide's Cover (about 12 characters a line, 2 lines; the line one line of
  // about 10 words): shown, never enforced.
  const notes = coverNotes(t, l);
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
        {notes.length > 0 && (
          <div className="rounded-2xl bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-900">
            <p className="font-bold">Long for the TV</p>
            <ul className="mt-1 list-disc pl-4">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <SheetError error={error} />
        <Button type="submit" className="w-full rounded-2xl" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
    </Sheet>
  );
}

function QuoteSheet({
  items,
  current,
  busy,
  error,
  onClose,
  onPick,
}: {
  items: Item[];
  current: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (itemId: string | null, idx: number | null) => void;
}) {
  return (
    <Sheet title="Closing quote" onClose={onClose}>
      <p className="mb-3 text-[13px] leading-snug text-gray-600">Only lines you said word for word can close the meeting. They show here when a thought has one.</p>
      <SheetError error={error} />
      <div className="mt-3 space-y-2">
        <button type="button" disabled={busy} onClick={() => onPick(null, null)} className={cn("w-full rounded-2xl border px-3.5 py-3 text-left text-[15px] font-semibold", current ? "border-line text-gray-700" : "border-accent bg-tint text-accent-text")}>
          No closing quote
        </button>
        {items.flatMap((item) =>
          item.quote_candidates.map((q, idx) => (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              disabled={busy}
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
