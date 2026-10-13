"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

export function SignupForm({ inviteToken, email }: { inviteToken?: string; email?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("password") !== f.get("confirm")) return setError("Passwords don't match.");
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ next: string }>("/api/auth/signup", {
            body: {
              name: f.get("name"),
              email: f.get("email"),
              password: f.get("password"),
              inviteToken,
            },
          });
          window.location.href = r.next;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sign-up failed");
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="given-name"
          required
          maxLength={60}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={email}
          readOnly={!!email}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password (10+ characters)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
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
        {busy ? "Creating…" : "Create account"}
      </button>
      <p className="text-xs text-text-3">
        Next you&apos;ll set up 2-factor authentication (required).
      </p>
    </form>
  );
}
