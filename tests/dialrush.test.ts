import { test } from "node:test";
import assert from "node:assert/strict";
import { readPastedAddress } from "../src/lib/dialrush-types";

test("the pasted address: the whole address, only its query, or with spaces around it", () => {
  assert.deepEqual(readPastedAddress("http://127.0.0.1:47812/dialrush?code=abc123&state=xyz"), { code: "abc123", state: "xyz" });
  assert.deepEqual(readPastedAddress("  127.0.0.1:47812/dialrush?state=xyz&code=abc123  "), { code: "abc123", state: "xyz" });
  assert.deepEqual(readPastedAddress("?code=a%2Fb&state=s#frag"), { code: "a/b", state: "s" });
  assert.deepEqual(readPastedAddress("code=abc&state=s"), { code: "abc", state: "s" });
});

test("no code, no state, or a declined sign-in", () => {
  assert.equal(readPastedAddress("http://127.0.0.1:47812/dialrush"), null);
  assert.equal(readPastedAddress("http://127.0.0.1:47812/dialrush?code=abc"), null);
  assert.equal(readPastedAddress(""), null);
  assert.deepEqual(readPastedAddress("http://127.0.0.1:47812/dialrush?error=access_denied&state=s"), { denied: true });
  assert.equal(readPastedAddress(`?code=${"x".repeat(2001)}&state=s`), null);
});
