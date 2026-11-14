"use client";

import { useState } from "react";

/**
 * The backstop when a screen fails to load or draw (most often no signal, or the app was updated
 * while the page was open). The menu and tab bar stay. Try again asks for the screen afresh and
 * clears this one; Reload loads the whole page anew (the new version of the app, if there is one).
 * Both work on every screen, Next meeting included: a link to the screen already open would leave
 * this message up (Next clears it only when the address changes).
 */
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [offline, setOffline] = useState(false);
  // Offline, either step would swap this page for the browser's own error page: wait for signal.
  const online = () => {
    if (navigator.onLine === false) {
      setOffline(true);
      return false;
    }
    setOffline(false);
    return true;
  };
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <p className="text-[20px] font-extrabold tracking-[-0.02em] text-gray-900">This screen didn&apos;t load</p>
      <p className="mt-1.5 max-w-xs text-[14px] leading-snug text-gray-600">Check your signal, then try again. If it still doesn&apos;t load, tap Reload.</p>
      {offline && <p className="mt-3 text-[14px] font-semibold text-red-700">Still no connection.</p>}
      <button
        type="button"
        onClick={() => {
          if (online()) retry();
        }}
        className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-tide-strong px-5 text-[15px] font-bold text-white shadow-glow"
      >
        Try again
      </button>
      <button
        type="button"
        onClick={() => {
          if (online()) window.location.reload();
        }}
        className="mt-2 inline-flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-bold text-accent-text hover:bg-tint"
      >
        Reload
      </button>
    </div>
  );
}
