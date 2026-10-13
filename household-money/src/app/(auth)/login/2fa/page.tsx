"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

export default function TwoFactorPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold">Two-factor code</h1>
      <p className="mb-6 text-center text-sm text-text-2">
        Enter the 6-digit code from your authenticator app.
      </p>
      <form
        className="card space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ next: string }>("/api/auth/totp", {
              body: { code: new FormData(e.currentTarget).get("code") },
            });
            window.location.href = r.next;
          } catch (err) {
            setError(err instanceof Error ? err.message : "Verification failed");
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="code">
            Authentication code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            className="input text-center text-xl tracking-[0.4em]"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
    </>
  );
}
