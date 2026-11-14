"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isNoConnection, isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import { connectClaude, connectCommandCenter, connectPocket, disconnect } from "./actions";

/**
 * The two connections the owner pastes on his phone. Forms submit through onSubmit and
 * startTransition (never a form action prop), so a failed save keeps what was typed.
 */
export function ConnectionForms({
  pocket,
  cc,
  ai,
}: {
  pocket: { set: boolean; fromEnv: boolean };
  cc: { set: boolean; fromEnv: boolean; host: string };
  ai: { set: boolean; fromEnv: boolean; model: string };
}) {
  return (
    <div className="space-y-3">
      <Connection
        title="Pocket"
        status={pocket.set ? `Connected: your recordings show on the Pocket tab${pocket.fromEnv ? " · set in Vercel" : ""}` : "Not connected: the Pocket tab is empty."}
        connected={pocket.set}
        fromEnv={pocket.fromEnv}
        label="Pocket API key"
        help="In the Pocket app: Settings, Developer, API Keys. It starts with pk_. The same key Command Center uses works here."
        placeholder="pk_…"
        save={connectPocket}
        forget={() => disconnect("pocket")}
      />
      <Connection
        title="Command Center"
        status={cc.set ? `Connected (${cc.host})${cc.fromEnv ? " · set in Vercel" : ""}` : "Not connected: no thoughts come in."}
        connected={cc.set}
        fromEnv={cc.fromEnv}
        label="Connector address or token"
        help="In Command Center: the claude.ai connector address (the one with “token=” in it). Paste it whole."
        placeholder="https://…/api/mcp?token=…"
        save={connectCommandCenter}
        forget={() => disconnect("cc")}
      />
      <Connection
        title="Claude"
        status={ai.set ? `Connected · ${ai.model}${ai.fromEnv ? " · set in Vercel" : ""}` : "Not connected: slides are plain Key lines."}
        connected={ai.set}
        fromEnv={ai.fromEnv}
        label="Claude API key"
        help="A key from the Claude Console (platform.claude.com), starting with sk-ant-. Make a new one just for Meetings."
        placeholder="sk-ant-…"
        save={connectClaude}
        forget={() => disconnect("anthropic")}
      />
    </div>
  );
}

function Connection({
  title,
  status,
  connected,
  fromEnv,
  label,
  help,
  placeholder,
  save,
  forget,
}: {
  title: string;
  status: string;
  connected: boolean;
  fromEnv: boolean;
  label: string;
  help: string;
  placeholder: string;
  save: (v: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  forget: () => Promise<{ ok: boolean; message?: string; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!connected);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `conn-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-[22px] bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connected ? "bg-green-700" : "bg-amber-400"}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-gray-900">{title}</span>
          <span className="block text-[13px] text-gray-500">{status}</span>
        </span>
        {!fromEnv && !open && (
          <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-full px-3 text-[14px] font-bold text-accent-text hover:bg-tint">
            Change
          </button>
        )}
      </div>
      {open && !fromEnv && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await safeAction(() => save(value));
              // The app was updated since this page loaded: load the new version (a key is never
              // kept in the browser, so he pastes it once more).
              if (isStale(r)) {
                setError(reloadForUpdate() ?? (r.error ?? null));
                return;
              }
              if (r.ok) {
                toast(r.message ?? "Saved.");
                setValue("");
                setOpen(false);
                router.refresh();
              } else {
                setError(r.error ?? "That didn't work.");
                // "Saved, but…" answers changed what the page shows; a lost connection changed nothing.
                if (!isNoConnection(r)) router.refresh();
              }
            });
          }}
        >
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoComplete="off" autoCapitalize="none" spellCheck={false} type="password" />
          <p className="text-[12px] leading-snug text-gray-500">{help}</p>
          {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1 rounded-2xl" disabled={pending || !value.trim()}>
              {pending ? "Testing…" : "Save and test"}
            </Button>
            {connected && (
              <Button
                type="button"
                variant="secondary"
                className="rounded-2xl"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await safeAction(forget);
                    if (isStale(r)) {
                      setError(reloadForUpdate() ?? (r.error ?? null));
                      return;
                    }
                    toast(r.ok ? (r.message ?? "") : (r.error ?? "That didn't work."), r.ok);
                    if (!r.ok) return;
                    setOpen(true);
                    router.refresh();
                  })
                }
              >
                Disconnect
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
