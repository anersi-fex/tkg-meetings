import { test } from "node:test";
import assert from "node:assert/strict";
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import { DRAFT_SAYS, NOTE_MAX, RUN_CLOCK, TEST_SAYS, callDeadline, claudeTrouble, joinNotes, lastClaimAt, listValues } from "../src/lib/checks";

/** An error as the SDK makes it from the API's answer. */
const api = (status: number, type: string, message: string) => APIError.generate(status, { type: "error", error: { type, message } }, undefined, new Headers());
const kind = (err: unknown) => claudeTrouble(err).kind;

test("every out-of-credit and spend-limit answer reads as out of credit", () => {
  assert.equal(kind(api(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.")), "credit");
  assert.equal(kind(api(400, "invalid_request_error", "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.")), "credit");
  assert.equal(kind(api(400, "invalid_request_error", "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.")), "credit");
  assert.equal(kind(api(400, "invalid_request_error", "This request would exceed your organization's spend limit.")), "credit");
  assert.equal(kind(api(402, "billing_error", "There is a problem with your payment method.")), "credit");
  assert.equal(kind(api(429, "rate_limit_error", "You have reached your monthly usage limit.")), "credit");
  assert.equal(kind(api(403, "permission_error", "Your workspace has run out of credits. Purchase credits to continue.")), "credit");
  // The log names the class only, and says it was credit.
  assert.equal(claudeTrouble(api(400, "invalid_request_error", "Your credit balance is too low")).cls, "api_400_invalid_request_error_credit");
  // What he reads says what to do about either one.
  assert.match(DRAFT_SAYS.credit, /out of credit/);
  assert.match(DRAFT_SAYS.credit, /spend limit/);
  assert.match(DRAFT_SAYS.credit, /Billing/);
  assert.match(TEST_SAYS.credit, /out of credit/);
  assert.match(TEST_SAYS.credit, /spend limit/);
});

test("other answers keep their own meaning", () => {
  assert.equal(kind(api(401, "authentication_error", "invalid x-api-key")), "key");
  assert.equal(kind(api(403, "permission_error", "This key can't do that.")), "key");
  assert.equal(kind(api(404, "not_found_error", "model: claude-x")), "model");
  assert.equal(kind(api(400, "invalid_request_error", "Unexpected value(s) `x` for the `anthropic-beta` header.")), "model");
  assert.equal(kind(api(429, "rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit.")), "busy");
  assert.equal(
    kind(api(429, "rate_limit_error", "This request would exceed the rate limit for your organization of 400,000 output tokens per minute. Please see the response headers for current usage, or contact sales about a rate limit increase.")),
    "busy",
  );
  assert.equal(kind(api(529, "overloaded_error", "Overloaded")), "busy");
  assert.equal(kind(api(500, "api_error", "Internal server error")), "busy");
  // A plain bad request is not a credit problem, even when it names a token budget.
  assert.equal(kind(api(400, "invalid_request_error", "thinking.budget_tokens: Extra inputs are not permitted")), "turned_down");
  assert.equal(kind(api(413, "request_too_large", "Request exceeds the maximum size")), "turned_down");
  assert.equal(kind(new APIUserAbortError()), "slow");
  assert.equal(kind(new APIConnectionTimeoutError()), "slow");
  assert.equal(kind(new APIConnectionError({ message: "fetch failed" })), "busy");
  assert.equal(kind(new TypeError("x")), "other");
  assert.equal(claudeTrouble(new TypeError("x")).cls, "TypeError");
});

test("a draft's note never outgrows its column", () => {
  const long = ["Christopherson", "Maximilianus", "Alexandrina", "Bartholomew", "Constantine", "Evangelina"];
  const parts = [
    `Check the numbers: ${listValues(["1,250,000", "2,500,000", "3,750,000", "4,000,000", "5,000,000", "6,250,000"])} aren’t in what you said.`,
    `Check the names: ${listValues(long)} aren’t in what you said or on the team list.`,
    "The Big news had an open item, so it’s a Key line: a red slide shows only what’s decided.",
    "Claude is out of credit or hit its spend limit: in the Claude Console, add credit (Billing) or raise the limit (Limits), then tap Redo.",
  ];
  const full = parts.join(" ");
  assert.ok(full.length > NOTE_MAX);
  const note = joinNotes(parts);
  assert.ok(note);
  assert.ok([...note].length <= NOTE_MAX, `${[...note].length} characters`);
  assert.ok(note.endsWith("…"));
  // Cut at a word, never in the middle of one.
  const kept = note.slice(0, -1);
  assert.ok(full.startsWith(kept));
  assert.match(full.slice(kept.length, kept.length + 1), /[\s,;:]/);
  // Short notes stay whole; nothing at all is null.
  assert.equal(joinNotes(["Check the names: Joe isn’t in what you said or on the team list.", null, ""]), "Check the names: Joe isn’t in what you said or on the team list.");
  assert.equal(joinNotes([null, " "]), null);
  assert.equal(joinNotes(["a ".repeat(400)])!.length <= NOTE_MAX, true);
  // A few values, each short.
  assert.equal(listValues(["1", "2"]), "1, 2");
  assert.equal(listValues(["1", "2", "3", "4", "5", "6"]), "1, 2, 3, 4 and 2 more");
  assert.equal(listValues(["Abcdefghijklmnopqrstuvwxyz"]), "Abcdefghijklmnopqrs…");
});

test("a run's time counts from when its page or action started", () => {
  const start = 1_000_000;
  const fnEnd = start + RUN_CLOCK.functionMs;
  // Right away: a whole call.
  assert.equal(callDeadline(start, start), start + RUN_CLOCK.callMs);
  // Settings: the key's test took 60 s first. The call still ends, saved, inside the 300 s.
  const afterTest = start + 60_000;
  const d = callDeadline(start, afterTest);
  assert.ok(d !== null && d + RUN_CLOCK.saveMs <= fnEnd - RUN_CLOCK.endMarginMs);
  // Later: a shorter call, never past the end; then none.
  const late = start + 140_000;
  const d2 = callDeadline(start, late);
  assert.ok(d2 !== null && d2 - late >= RUN_CLOCK.minCallMs && d2 + RUN_CLOCK.saveMs <= fnEnd);
  assert.equal(callDeadline(start, lastClaimAt(start) + 1), null);
  assert.notEqual(callDeadline(start, lastClaimAt(start)), null);
  // No moment of any run lets a call end after the function does.
  for (let t = start; t <= fnEnd; t += 5_000) {
    const end = callDeadline(start, t);
    if (end !== null) assert.ok(end + RUN_CLOCK.saveMs <= fnEnd, `claimed at ${t - start} ms`);
  }
});
