"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { toast } from "@/components/toaster";
import { isNoConnection, isStale, reloadForUpdate, safeAction } from "@/lib/safe-action";
import type { Block } from "@/lib/today-plan";
import { disconnectDialRush, saveToday } from "./actions";

/** DialRush, the daily goal (connections) and the dial blocks. */
export function TodaySettings({ connected, goal, blocks }: { connected: boolean; goal: number; blocks: Block[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [g, setG] = useState(String(goal));
  const [bs, setBs] = useState<Block[]>(blocks);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await safeAction(fn);
      if (isStale(r)) {
        setError(reloadForUpdate() ?? null);
        return;
      }
      if (r.ok) {
        setError(null);
        toast(r.message ?? "Saved.");
        router.refresh();
      } else {
        setError(r.error ?? "That didn't save.");
        if (!isNoConnection(r)) router.refresh();
      }
    });
  return (
    <div className="space-y-3">
      <div className="rounded-[22px] bg-surface p-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connected ? "bg-green-700" : "bg-amber-400"}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-gray-900">DialRush</span>
            <span className="block text-[13px] text-gray-500">{connected ? "Connected: Today reads your connections." : "Not connected: Today can't count your connections."}</span>
          </span>
          {connected ? (
            <button type="button" disabled={pending} onClick={() => run(disconnectDialRush)} className="h-10 rounded-full px-3 text-[14px] font-bold text-accent-text hover:bg-tint">
              Disconnect
            </button>
          ) : (
            <a href="/api/dialrush/connect" className="inline-flex h-10 items-center rounded-full bg-tide-strong px-4 text-[14px] font-bold text-white">
              Connect
            </a>
          )}
        </div>
      </div>
      <form
        className="space-y-3 rounded-[22px] bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveToday({ goal: Number(g), blocks: bs }));
        }}
      >
        <div>
          <Label htmlFor="goal">Daily goal (connections)</Label>
          <Input id="goal" inputMode="numeric" value={g} onChange={(e) => setG(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <div className="space-y-2">
          <p className="text-[14px] font-semibold text-gray-700">Dial blocks (weekdays)</p>
          {bs.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Block ${i + 1} starts`} type="time" value={b.start} onChange={(e) => setBs(bs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
              <span className="text-gray-500">to</span>
              <Input aria-label={`Block ${i + 1} ends`} type="time" value={b.end} onChange={(e) => setBs(bs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              <button type="button" aria-label={`Remove block ${i + 1}`} onClick={() => setBs(bs.filter((_, j) => j !== i))} className="h-11 w-11 shrink-0 rounded-full text-[18px] font-bold text-gray-500 hover:bg-gray-100">
                ×
              </button>
            </div>
          ))}
          {bs.length < 4 && (
            <button type="button" onClick={() => setBs([...bs, { start: "16:00", end: "17:00" }])} className="min-h-11 text-[14px] font-bold text-accent-text">
              + Add a block
            </button>
          )}
        </div>
        {error && <p className="text-[13px] font-semibold text-red-700">{error}</p>}
        <Button type="submit" className="w-full rounded-2xl" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
