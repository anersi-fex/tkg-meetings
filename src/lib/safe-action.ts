/**
 * Calls a server action from the browser and always gets an answer back. A call that never reaches
 * the server (no signal, or the app was updated since the page loaded and the old action is gone)
 * rejects instead of answering; without this the page would fall to an error screen and lose what
 * the owner typed. Browser-safe, no React.
 */

export const NO_CONNECTION = "No connection. Nothing was lost; try again.";

export async function safeAction<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: NO_CONNECTION };
  }
}

/**
 * True when the answer is safeAction's own "no connection". Callers then skip router.refresh():
 * a refresh that cannot reach the server falls back to a full page load, which would wipe the
 * screen (and anything typed on it) for the browser's offline page.
 */
export function isNoConnection(r: { ok: boolean; error?: string }): boolean {
  return !r.ok && r.error === NO_CONNECTION;
}
