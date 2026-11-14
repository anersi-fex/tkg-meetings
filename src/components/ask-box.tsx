"use client";

import { useState } from "react";
import { Button, Textarea, cn } from "@/components/ui";

/**
 * "Tell Claude" for a slide or a whole meeting: a box for his own words and chips for the usual
 * asks. A chip fills the box (tap another to add it); the button sends what the box says.
 */
export function AskBox({
  title,
  placeholder,
  chips,
  button,
  disabled,
  onAsk,
  children,
}: {
  title: string;
  placeholder: string;
  chips: string[];
  button: string;
  disabled?: boolean;
  /** Resolves true when Claude took it (the box then empties). */
  onAsk: (ask: string) => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const add = (chip: string) => setText((t) => (t.trim() ? (t.toLowerCase().includes(chip.toLowerCase()) ? t : `${t.trim().replace(/[.,]$/, "")}, ${chip.toLowerCase()}`) : chip));
  return (
    <section className="space-y-2.5 rounded-[22px] bg-surface p-4 shadow-card">
      <p className="text-[15px] font-bold text-gray-900">{title}</p>
      {children}
      <Textarea aria-label={title} value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder={placeholder} rows={2} className="text-[16px]" />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => add(c)}
            className={cn("min-h-9 rounded-full px-3 text-[13px] font-bold", text.toLowerCase().includes(c.toLowerCase()) ? "bg-tide-strong text-white" : "bg-tint text-accent-text")}
          >
            {c}
          </button>
        ))}
      </div>
      <Button
        type="button"
        className="w-full rounded-2xl"
        disabled={disabled || sending || !text.trim()}
        onClick={async () => {
          setSending(true);
          const ok = await onAsk(text.trim()).catch(() => false);
          setSending(false);
          if (ok) setText("");
        }}
      >
        {sending ? "Sending…" : button}
      </Button>
    </section>
  );
}
