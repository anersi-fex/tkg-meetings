/** His DialRush numbers for a day or a range (browser-safe). */
export interface DialStats {
  dials: number;
  connects: number;
  appointments: number;
  talkSeconds: number;
}

/**
 * The code and state in the address he pasted after approving DialRush's sign-in (the whole
 * address, or only its "?code=…" part). Null when there is none; `denied` when DialRush says he
 * declined. Pure.
 */
export function readPastedAddress(pasted: string): { code: string; state: string } | { denied: true } | null {
  const text = pasted.trim().slice(0, 4000);
  const q = text.includes("?") ? text.slice(text.indexOf("?") + 1) : text;
  const p = new URLSearchParams(q.split("#")[0]);
  if (p.get("error")) return { denied: true };
  const code = p.get("code") ?? "";
  const state = p.get("state") ?? "";
  if (!code || !state || code.length > 2000 || state.length > 200) return null;
  return { code, state };
}
