"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { PasskeyButton } from "../passkey-button";

export function LoginForm({ demo }: { demo: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = (next: string) => (window.location.href = next);

  return (
    <div className="space-y-4">
      <PasskeyButton mode="login" onDone={go} onError={setError} />
      <form
        className="card space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ next: string }>("/api/auth/login", {
              body: { email: f.get("email"), password: f.get("password") },
            });
            go(r.next);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign-in failed");
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="input"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
      {demo && (
        <p className="text-center text-xs text-text-3">
          Demo mode: kanchit@demo.local or wife@demo.local / demo-password-123 (TOTP secrets in
          README).
        </p>
      )}
      <p className="text-center text-sm text-text-2">
        First time here?{" "}
        <a className="font-semibold text-accent underline" href="/signup">
          Create the household
        </a>
      </p>
    </div>
  );
}
