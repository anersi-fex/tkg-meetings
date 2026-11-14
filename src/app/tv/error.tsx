"use client";

import { useEffect } from "react";

/** The TV's fixed dark look (the same values as tv-view.tsx and the slides' letterbox). */
const BG = "#0b0d12";
const TEXT = "#eef0f5";
const MUTED = "#a3a9b8";

const KEY = "tv-reconnect";
/** Reloads close together back off (5 s, 10 s, 20 s... up to a minute); a quiet spell starts over. */
function reloadDelay(): number {
  let n = 0;
  try {
    const last = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { n?: number; at?: number } | null;
    if (last && typeof last.n === "number" && typeof last.at === "number" && Date.now() - last.at < 5 * 60_000) n = last.n + 1;
    sessionStorage.setItem(KEY, JSON.stringify({ n, at: Date.now() }));
  } catch {
    /* storage blocked: the shortest wait every time */
  }
  return Math.min(60_000, 5_000 * 2 ** Math.min(n, 4));
}

/**
 * The TV when its screen fails (no network, the server not answering, or an update since the
 * page loaded): a quiet "Reconnecting" in the TV's dark, never an error page in front of the room.
 * Nobody is there to tap anything, so it tries by itself: it asks the server if it is back, and
 * only then loads the TV again (loading it while offline would leave the browser's own error page,
 * which never retries).
 */
export default function TvError() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let gone = false;
    const check = async () => {
      try {
        const res = await fetch("/api/show?k=", { cache: "no-store" });
        // The server and the database answer (401: signed out, the TV page sends it to sign in).
        if (!gone && (res.ok || res.status === 401)) {
          window.location.reload();
          return;
        }
      } catch {
        /* still offline */
      }
      if (!gone) timer = setTimeout(check, 5_000);
    };
    timer = setTimeout(check, reloadDelay());
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: BG, fontFamily: "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', Arial, sans-serif" }}>
      <p style={{ color: TEXT, fontSize: "clamp(28px, 5vw, 64px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>Team meeting</p>
      <p role="status" style={{ color: MUTED, fontSize: "clamp(16px, 2vw, 28px)", fontWeight: 600 }}>
        Reconnecting…
      </p>
    </main>
  );
}
