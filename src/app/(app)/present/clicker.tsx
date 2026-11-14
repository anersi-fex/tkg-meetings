"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShowState } from "@/lib/types";
import { LAYOUT_LABEL, slideHeadline, type DrawnSlide } from "@/lib/slides";
import { SlideBox } from "@/components/slides/slide";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isNoConnection, safeAction } from "@/lib/safe-action";
import { endPreview, finishMeeting, moveShow, stopShow } from "../actions";

/**
 * The phone as the clicker: the slide on the TV, the next one, the speaker notes, Back and Next
 * (big, for a thumb), Pause and End meeting. It follows the TV's state (another clicker or the TV's
 * own keys move it too) by asking every second and a half.
 */
export function Clicker({ initial }: { initial: ShowState }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [deck, setDeck] = useState<DrawnSlide[]>(initial.deck ?? []);
  const [pending, start] = useTransition();
  const [ending, setEnding] = useState(false);
  // Which deck this phone holds ("<meeting>:<version>"); "" asks the server for it again.
  const deckKey = useRef(initial.deck ? initial.deckKey : "");
  // Taps sent and not answered yet, and a counter that ticks at every tap and every answer. A poll
  // answer counts only when it was asked after the last tick and no tap is on its way: one asked
  // earlier still has the slide from before the tap and would jump the phone back for a moment.
  const inFlight = useRef(0);
  const tick = useRef(0);

  const poll = useCallback(async () => {
    const askedAt = tick.current;
    try {
      const res = await fetch(`/api/show?k=${encodeURIComponent(deckKey.current)}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ShowState;
      if (inFlight.current > 0 || askedAt !== tick.current) return;
      if (next.deck) {
        setDeck(next.deck);
        deckKey.current = next.deckKey;
      } else if (next.status !== "live" || next.deckKey !== deckKey.current) {
        // The show ended or another meeting is on: forget the old deck so it never shows again.
        setDeck([]);
        deckKey.current = "";
      }
      setState(next);
    } catch {
      /* offline for a moment: the next poll tries again */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [poll]);

  const move = useCallback(
    (delta: 1 | -1) => {
      // Show the move at once; the server's answer (and the poll after it) confirm it.
      setState((s) => ({ ...s, current: Math.max(0, Math.min(s.total - 1, s.current + delta)) }));
      inFlight.current += 1;
      tick.current += 1;
      start(async () => {
        const r = await safeAction(() => moveShow({ delta }));
        inFlight.current -= 1;
        tick.current += 1;
        if (!r.ok) toast(r.error, false);
        if (inFlight.current === 0) await poll();
      });
    },
    [poll],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  if (state.status !== "live") {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <p className="text-[20px] font-extrabold tracking-[-0.02em] text-gray-900">The show stopped</p>
        <Button type="button" className="mt-6 rounded-2xl" onClick={() => router.push("/")}>
          Back to Next meeting
        </Button>
      </div>
    );
  }

  const current = deck[state.current];
  const next = deck[state.current + 1];

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-1">
        <p className="text-[13px] font-bold tracking-[0.06em] text-gray-500 uppercase">On the TV</p>
        <p className="font-mono text-[15px] font-bold text-gray-900">
          {state.current + 1} / {state.total}
        </p>
      </div>
      {current && <SlideBox slide={current} uid={`clicker-${state.deckVersion}-${state.current}`} className="rounded-[16px] shadow-card" label={slideHeadline(current)} />}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={state.current === 0}
          className="flex h-20 items-center justify-center gap-2 rounded-[22px] bg-surface text-[18px] font-extrabold text-gray-900 shadow-card active:scale-[0.98] disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={state.current >= state.total - 1}
          className="flex h-20 items-center justify-center gap-2 rounded-[22px] bg-tide-strong text-[18px] font-extrabold text-white shadow-glow active:scale-[0.98] disabled:opacity-40"
        >
          Next
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {next ? (
        <p className="truncate px-1 text-[14px] text-gray-600">
          <span className="font-bold text-gray-900">Next:</span> {slideHeadline(next)}
        </p>
      ) : (
        <p className="px-1 text-[14px] font-semibold text-gray-600">Last slide.</p>
      )}

      {current?.notes ? (
        <div className="rounded-[22px] bg-surface p-4 shadow-card">
          <p className="text-[12px] font-bold tracking-[0.06em] text-gray-500 uppercase">{LAYOUT_LABEL[current.layout]} · your notes</p>
          <p className="mt-1.5 text-[16px] leading-relaxed text-gray-900">{current.notes}</p>
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="h-12 flex-1 rounded-2xl"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await safeAction(stopShow);
              toast(r.ok ? (r.message ?? "") : r.error, r.ok);
              if (r.ok) router.push("/");
            })
          }
        >
          Pause
        </Button>
        <Button type="button" variant="danger" className="h-12 flex-1 rounded-2xl" disabled={pending} onClick={() => setEnding(true)}>
          End meeting
        </Button>
      </div>

      {ending && <EndMeetingSheet meetingId={state.meetingId} live onClose={() => setEnding(false)} />}
    </div>
  );
}

type Preview = { titles: string[]; shown: boolean } | { error: string };

/** The server's answer when this screen's meeting was ended already (from another screen). */
const ALREADY_ENDED = "That meeting already ended.";

/**
 * "End the meeting?": asks the server, when it opens, which thoughts End will mark done in Command
 * Center (only the ones the TV showed), lists them, then ends the meeting and goes to Past. Used by
 * the clicker and by Next meeting (a paused meeting, or one held without the TV). It names the
 * meeting this screen shows, so a screen left open from an earlier meeting can't end a new one.
 */
export function EndMeetingSheet({ meetingId, live, onClose }: { meetingId: string | null; live: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    safeAction(() => endPreview(meetingId ?? undefined)).then((r) => {
      if (!gone) setPreview(r.ok ? { titles: r.titles, shown: r.shown } : { error: r.error });
    });
    return () => {
      gone = true;
    };
  }, [meetingId]);

  const ended = preview != null && "error" in preview && preview.error === ALREADY_ENDED;
  const end = () => {
    setError(null);
    if (ended) {
      router.push("/past");
      return;
    }
    start(async () => {
      const r = await safeAction(() => finishMeeting(meetingId ?? undefined));
      if (r.ok || r.error === ALREADY_ENDED) {
        toast(r.ok ? (r.message ?? "Meeting saved.") : r.error, r.ok);
        router.push("/past");
        return;
      }
      setError(r.error);
      if (!isNoConnection(r)) router.refresh();
    });
  };

  return (
    <Sheet title="End the meeting?" onClose={onClose}>
      <p className="text-[14px] leading-snug text-gray-700">{live ? "The meeting moves to Past and the TV goes back to waiting." : "The meeting moves to Past."}</p>
      {preview == null ? (
        <p className="mt-3 text-[14px] leading-snug text-gray-500">Checking what the TV showed…</p>
      ) : ended ? (
        <p className="mt-3 text-[14px] leading-snug font-semibold text-gray-900">{ALREADY_ENDED} It&apos;s in Past.</p>
      ) : "error" in preview ? (
        <p className="mt-3 text-[14px] leading-snug text-gray-600">Couldn&apos;t check which thoughts will be marked done. {preview.error}</p>
      ) : preview.titles.length > 0 ? (
        <>
          <p className="mt-3 text-[14px] leading-snug font-semibold text-gray-900">
            {preview.titles.length === 1 ? "This one will be marked done in Command Center:" : `These ${preview.titles.length} will be marked done in Command Center:`}
          </p>
          <ul className="mt-1.5 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-[14px] text-gray-700">
            {preview.titles.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-gray-500">Thoughts the TV didn&apos;t show stay open in Command Center.</p>
        </>
      ) : preview.shown ? (
        <p className="mt-3 text-[14px] leading-snug text-gray-700">Nothing new to mark done in Command Center.</p>
      ) : (
        <p className="mt-3 text-[14px] leading-snug text-gray-700">Nothing was shown on the TV, so nothing will be marked done in Command Center.</p>
      )}
      {error && <p className="mt-3 text-[14px] leading-snug font-semibold text-red-700">{error}</p>}
      <Button type="button" variant={ended ? "primary" : "danger"} className="mt-4 h-12 w-full rounded-2xl" disabled={pending || preview == null} onClick={end}>
        {ended ? "Go to Past" : pending ? "Ending…" : "End meeting"}
      </Button>
    </Sheet>
  );
}
