"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * The backstop when a screen fails to load or draw (most often no signal, or the app was updated
 * while the page was open). The menu and tab bar stay; Try again loads the screen afresh.
 */
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [offline, setOffline] = useState(false);
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <p className="text-[20px] font-extrabold tracking-[-0.02em] text-gray-900">This screen didn&apos;t load</p>
      <p className="mt-1.5 max-w-xs text-[14px] leading-snug text-gray-600">What you saved is safe. Check your signal, then try again.</p>
      {offline && <p className="mt-3 text-[14px] font-semibold text-red-700">Still no connection.</p>}
      <button
        type="button"
        onClick={() => {
          // Offline, a retry would swap this page for the browser's own error page: wait for signal.
          if (navigator.onLine === false) {
            setOffline(true);
            return;
          }
          setOffline(false);
          retry();
        }}
        className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-tide-strong px-5 text-[15px] font-bold text-white shadow-glow"
      >
        Try again
      </button>
      <Link href="/" className="mt-2 inline-flex min-h-11 items-center rounded-2xl px-4 text-[15px] font-bold text-accent-text hover:bg-tint">
        Next meeting
      </Link>
    </div>
  );
}
