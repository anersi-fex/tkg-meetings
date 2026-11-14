"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowState } from "@/lib/types";
import { slideHeadline, type DrawnSlide } from "@/lib/slides";
import { SlideView } from "@/components/slides/slide";
import { dayLabel } from "@/lib/month";
import { moveShow } from "@/app/(app)/actions";
import { safeAction } from "@/lib/safe-action";

/**
 * The TV: one slide at a time, as large as the screen allows at 16:9 (letterboxed in the slides'
 * own dark), following the owner's clicker by asking once a second. Between meetings it shows a
 * quiet waiting screen. F (or a double click) for full screen; the screen stays awake; the cursor
 * hides when still. When a new version of the app is deployed, the TV reloads itself once.
 * Signed in as the owner, the arrow keys and a presenter remote move the slides too.
 *
 * The deck is asked for by its key ("<meeting>:<version>", ?k=): versions start over in every
 * meeting, so the key carries the meeting too, and the TV forgets its deck as soon as the show
 * ends or another meeting comes on. A TV left on for weeks never shows last week's slides.
 */
export function TvView({ initial, canControl }: { initial: ShowState | null; canControl: boolean }) {
  const [state, setState] = useState<ShowState | null>(initial);
  const [deck, setDeck] = useState<DrawnSlide[]>(initial?.deck ?? []);
  const [idle, setIdle] = useState(false);
  const [offline, setOffline] = useState(false);
  // Which deck the TV holds; "" asks the server for it again.
  const deckKey = useRef(initial?.deck ? initial.deckKey : "");
  const build = useRef(initial?.build ?? null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/show?k=${encodeURIComponent(deckKey.current)}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign(new URL("/login?next=/tv", window.location.origin).toString());
        return;
      }
      if (!res.ok) {
        setOffline(true);
        return;
      }
      const next = (await res.json()) as ShowState;
      setOffline(false);
      if (build.current && next.build && next.build !== build.current) {
        window.location.reload();
        return;
      }
      build.current = next.build;
      if (next.deck) {
        setDeck(next.deck);
        deckKey.current = next.deckKey;
      } else if (next.status !== "live" || next.deckKey !== deckKey.current) {
        // The show ended, or another meeting is on: drop the old deck.
        setDeck([]);
        deckKey.current = "";
      }
      setState(next);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(poll, 1000);
    return () => clearInterval(t);
  }, [poll]);

  // Keep the screen awake (re-asked when the tab comes back).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        /* not allowed here: fine */
      }
    };
    ask();
    const onVis = () => {
      if (document.visibilityState === "visible") ask();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => undefined);
    };
  }, []);

  // The cursor hides after two still seconds.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      setIdle(false);
      if (t) clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    return () => {
      window.removeEventListener("pointermove", wake);
      if (t) clearTimeout(t);
    };
  }, []);

  // F for full screen; the owner's keys move the show.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        else document.documentElement.requestFullscreen().catch(() => undefined);
        return;
      }
      if (!canControl) return;
      const delta = e.key === "ArrowRight" || e.key === "PageDown" || e.key === " " ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
      if (!delta) return;
      e.preventDefault();
      safeAction(() => moveShow({ delta })).then(() => poll());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, poll]);

  const live = state?.status === "live" && deck.length > 0;
  const slide = live ? deck[Math.min(state!.current, deck.length - 1)] : null;

  return (
    <main
      className={`fixed inset-0 flex items-center justify-center overflow-hidden ${idle ? "tv-idle" : ""}`}
      style={{ background: "#0b0d12" }}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
    >
      <div style={{ width: "min(100vw, calc(100vh * 16 / 9))" }}>
        {slide ? (
          <div key={`${state!.deckKey}-${state!.current}`} className="slide-box slide-in" role="img" aria-label={slideHeadline(slide)}>
            <div className="slide-canvas">
              <SlideView slide={slide} uid={`tv-${state!.deckVersion}-${state!.current}`} />
            </div>
          </div>
        ) : (
          <Waiting meetsOn={state?.meetsOn ?? null} />
        )}
      </div>
      {offline && (
        <p className="fixed right-4 bottom-4 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: "#1b2030", color: "#c3c8d4" }}>
          Reconnecting…
        </p>
      )}
    </main>
  );
}

/** Between meetings: the Meetings mark, the next date, and a quiet line. */
function Waiting({ meetsOn }: { meetsOn: string | null }) {
  const u = (n: number) => `calc(var(--u) * ${n})`;
  return (
    <div className="slide-box" role="img" aria-label="Waiting for the meeting to start">
      <div className="slide-canvas" style={{ background: "radial-gradient(circle at 50% 38%, #2c1416 0%, #0b0d12 60%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(36), fontFamily: "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Arial, sans-serif" }}>
        <span style={{ display: "inline-flex", width: u(160), height: u(160), borderRadius: u(44), background: "linear-gradient(135deg, #e5484d, #ff8a5c)" }}>
          <svg viewBox="0 0 1024 1024" style={{ width: u(160), height: u(160) }} aria-hidden>
            <path
              fill="#fff6f4"
              fillRule="evenodd"
              d="M296 208H728A128 128 0 0 1 856 336V600A128 128 0 0 1 728 728H472L300 846Q268 866 268 828V728H296A128 128 0 0 1 168 600V336A128 128 0 0 1 296 208Z M334 384h356a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 468h276a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z M334 552h188a22 22 0 0 1 0 44H334a22 22 0 0 1 0-44z"
            />
          </svg>
        </span>
        <p style={{ fontSize: u(96), fontWeight: 800, letterSpacing: u(-3), color: "#eef0f5", lineHeight: 1.05 }}>Team meeting</p>
        <p style={{ fontSize: u(40), fontWeight: 600, color: "#a3a9b8" }}>{meetsOn ? `${dayLabel(meetsOn)} · waiting to start` : "Waiting to start"}</p>
      </div>
    </div>
  );
}
