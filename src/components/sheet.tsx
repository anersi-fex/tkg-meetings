"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

/**
 * A bottom sheet on a phone (a centered card on a computer): a dim backdrop, a title, the
 * content, closed by the backdrop, the close button or Escape. Focus moves into it once, when it
 * opens, and goes back where it was when it closes. The page behind may re-render while the sheet
 * is open (Next meeting looks again every few seconds while Claude drafts); that never moves the
 * focus, so the iPhone keyboard stays up while he types.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The latest onClose without making the effect below run again when the caller passes a new one.
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-[26px] bg-surface p-4 shadow-float outline-none"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
