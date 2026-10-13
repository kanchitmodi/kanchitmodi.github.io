"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { PasskeyButton } from "../passkey-button";

export default function LockPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = () => (window.location.href = "/");
  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold">Locked</h1>
      <p className="mb-6 text-center text-sm text-text-2">Locked after 5 minutes of inactivity.</p>
      <div className="space-y-4">
        <PasskeyButton mode="unlock" onDone={done} onError={setError} />
        <form
          className="card space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api("/api/auth/unlock", {
                body: { password: new FormData(e.currentTarget).get("password") },
              });
              done();
            } catch (err) {
              const code = (err as { code?: string }).code;
              if (code === "anonymous") return (window.location.href = "/login");
              setError(err instanceof Error ? err.message : "Unlock failed");
              setBusy(false);
            }
          }}
        >
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
            Unlock
          </button>
        </form>
        <form
          action="/api/auth/logout"
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          <button className="tap w-full text-sm text-text-2 underline">Sign out instead</button>
        </form>
      </div>
    </>
  );
}
