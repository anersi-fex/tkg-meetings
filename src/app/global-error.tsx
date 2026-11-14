"use client";

import "./globals.css";

/**
 * The last backstop: an error above every other screen (for example Sign out with no signal, or
 * just after an update). Plain words and two ways back; nothing about the error is shown.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4 text-center">
        <h1 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-gray-900">That didn&apos;t load</h1>
        <p className="mt-2 max-w-sm text-[15px] leading-snug text-gray-600">The connection may have dropped, or the app was just updated.</p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={() => reset()} className="min-h-11 rounded-xl bg-tide-strong px-5 text-sm font-bold text-white shadow-glow">
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl px-5 text-sm font-bold text-accent-text">
            Reload the app
          </button>
        </div>
      </body>
    </html>
  );
}
