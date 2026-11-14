import { test } from "node:test";
import assert from "node:assert/strict";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error.js";
import { APP_UPDATED, NO_CONNECTION, failureOf, isNextNavigation, isNoConnection, isStale, isStaleDeploy, safeAction } from "../src/lib/safe-action";

test("a deploy since the page loaded is told apart from no signal", () => {
  // The error Next 16.3.4 throws for an action id the new server doesn't know.
  const real = new UnrecognizedActionError(`Server Action "7f00aa" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action`);
  assert.equal(isStaleDeploy(real), true);
  assert.equal(isStaleDeploy({ name: "UnrecognizedActionError", message: "" }), true);
  assert.equal(isStaleDeploy(new Error(`Server Action "abc" was not found on the server.`)), true);
  assert.equal(isStaleDeploy(new TypeError("Failed to fetch")), false);
  assert.equal(isStaleDeploy(new TypeError("Load failed")), false);
  assert.equal(isStaleDeploy(new Error("An unexpected response was received from the server.")), false);
  assert.equal(isStaleDeploy(null), false);
  assert.deepEqual(failureOf(real), { ok: false, error: APP_UPDATED, stale: true });
  assert.deepEqual(failureOf(new TypeError("Failed to fetch")), { ok: false, error: NO_CONNECTION });
});

test("safeAction answers instead of throwing, and keeps Next's redirects going", async () => {
  assert.deepEqual(await safeAction(async () => ({ ok: true as const, message: "Saved." })), { ok: true, message: "Saved." });
  const offline = await safeAction(async (): Promise<{ ok: boolean }> => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(isNoConnection(offline), true);
  assert.equal(isStale(offline), false);
  const stale = await safeAction(async (): Promise<{ ok: boolean }> => {
    throw new UnrecognizedActionError(`Server Action "1" was not found on the server.`);
  });
  assert.equal(isStale(stale), true);
  // A stale answer is not "no connection": the caller loads the new version instead of waiting.
  assert.equal(isNoConnection(stale), false);
  // A redirect (or a not-found) from the action is Next's to follow, never swallowed.
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/past;307;" });
  assert.equal(isNextNavigation(redirect), true);
  assert.equal(isNextNavigation(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })), true);
  assert.equal(isNextNavigation(new Error("x")), false);
  await assert.rejects(
    safeAction(async () => {
      throw redirect;
    }),
    (e) => e === redirect,
  );
});
