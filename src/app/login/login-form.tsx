"use client";

import { startTransition, useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import { Button, Input, Label, Notice } from "@/components/ui";
import { APP_UPDATED, failureOf, isNextNavigation, reloadForUpdate } from "@/lib/safe-action";

const NO_SIGNAL = "No connection. Check your signal and try again.";

/**
 * The password form. Once the page is ready it sends through onSubmit + startTransition, so a try
 * that never reached the server keeps what he typed (a wrong password clears the field). The
 * action prop stays for the moment before that: a tap on Sign in while the page is still loading
 * is held and sent when it is ready, never posted as a plain form with the password in the address.
 */
export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [state, send, pending] = useActionState<LoginState, FormData>(async (prev, form) => {
    try {
      const r = await login(prev, form);
      // The server answered (a wrong password, too many tries): start the field over.
      setPassword("");
      return r;
    } catch (err) {
      // The right password: login() redirects, and Next follows it from here.
      if (isNextNavigation(err)) throw err;
      // The app was updated since this page loaded: load the new version.
      if (failureOf(err).stale) return { error: reloadForUpdate() ?? APP_UPDATED };
      // No signal: plain words instead of an error page, and the password stays typed.
      return { error: NO_SIGNAL };
    }
  }, { error: null });
  return (
    <form
      className="space-y-4"
      action={send}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        startTransition(() => send(form));
      }}
    >
      {state.error && <Notice tone="red">{state.error}</Notice>}
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="password" className="font-semibold">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-12 rounded-2xl text-[17px]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
      </div>
      <Button type="submit" className="h-12 w-full rounded-2xl text-[15px]" disabled={pending}>
        {pending ? "Checking..." : "Sign in"}
      </Button>
    </form>
  );
}
