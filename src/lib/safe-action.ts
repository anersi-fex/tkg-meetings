/**
 * Calls a server action from the browser and always gets an answer back. A call that never reaches
 * the server rejects instead of answering; without this the page would fall to an error screen and
 * lose what the owner typed. Two cases are told apart:
 * - no signal (or the server not answering): "No connection", and the caller keeps everything on
 *   screen so he taps again;
 * - the app was updated since the page loaded (the old action is gone on the new server): trying
 *   again can never work, so the answer says so (`stale`) and the caller loads the new version.
 * Browser-safe, no React.
 */

export const NO_CONNECTION = "No connection. Nothing was lost; try again.";
export const APP_UPDATED = "The app was updated. Reloading…";
/** When a reload just happened and the page still runs the old version (it should not happen). */
export const UPDATE_STUCK = "The app was updated. Close it and open it again.";

export type SafeFailure = { ok: false; error: string; stale?: true };

/**
 * True for Next's own control-flow errors (a redirect or a not-found thrown by the action): they
 * must keep going up so Next can follow them. The digest is how Next marks them.
 */
export function isNextNavigation(err: unknown): boolean {
  const digest = err && typeof err === "object" ? (err as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

/**
 * True when the server no longer knows the action this page holds: Next 16 throws
 * UnrecognizedActionError ("Server Action "…" was not found on the server") after a deploy.
 */
export function isStaleDeploy(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === "UnrecognizedActionError") return true;
  return typeof message === "string" && /Server Action\b[\s\S]*\bwas not found/.test(message);
}

/** What a failed call turns into: plain words, and `stale` when the app was updated. */
export function failureOf(err: unknown): SafeFailure {
  return isStaleDeploy(err) ? { ok: false, error: APP_UPDATED, stale: true } : { ok: false, error: NO_CONNECTION };
}

export async function safeAction<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | SafeFailure> {
  try {
    return await fn();
  } catch (err) {
    if (isNextNavigation(err)) throw err;
    return failureOf(err);
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

/** True when the app was updated since the page loaded: the caller reloads (reloadForUpdate). */
export function isStale(r: { ok: boolean }): r is { ok: false; error: string; stale: true } {
  return !r.ok && (r as { stale?: unknown }).stale === true;
}

const RELOADED_AT = "mtg-reloaded-for-update";
/** A second reload this soon means the first one didn't bring the new version: stop there. */
const RELOAD_GAP_MS = 30_000;

/**
 * Loads the new version of the app (a full page load). Returns null when the page is reloading, or
 * the words to show instead when it reloaded moments ago and still runs the old version, so a page
 * can never reload itself in a loop.
 */
export function reloadForUpdate(): string | null {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GAP_MS) return UPDATE_STUCK;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    /* storage blocked: reload anyway (every reload here follows one tap of his) */
  }
  window.location.reload();
  return null;
}
