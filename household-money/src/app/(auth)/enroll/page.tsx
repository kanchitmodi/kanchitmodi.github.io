"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

interface Setup {
  secret: string;
  uri: string;
  qr: string;
}

export default function EnrollPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Setup>("/api/auth/totp/setup", { body: {} })
      .then(setSetup)
      .catch((e: Error & { code?: string }) => {
        if (e.code === "totp_already_enabled") window.location.href = "/login/2fa";
        else if (e.code === "anonymous") window.location.href = "/login";
        else setError(e.message);
      });
  }, []);

  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold">Set up 2-factor</h1>
      <p className="mb-6 text-center text-sm text-text-2">
        Scan with iPhone Passwords, 1Password, or Google Authenticator. Required for every login.
      </p>
      <div className="card space-y-4 p-5">
        {setup ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qr}
              alt="QR code for your authenticator app"
              width={220}
              height={220}
              className="mx-auto rounded-lg bg-white p-2"
            />
            <details className="text-sm">
              <summary className="tap cursor-pointer py-2 text-text-2">
                Can&apos;t scan? Enter the key manually
              </summary>
              <code
                data-testid="totp-secret"
                className="block break-all rounded bg-surface-2 p-2 font-mono"
              >
                {setup.secret}
              </code>
              <a className="mt-2 inline-block font-semibold text-accent underline" href={setup.uri}>
                Open in authenticator app
              </a>
            </details>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  const r = await api<{ next: string }>("/api/auth/totp/enable", {
                    body: { code: new FormData(e.currentTarget).get("code") },
                  });
                  window.location.href = r.next;
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Verification failed");
                  setBusy(false);
                }
              }}
            >
              <label className="label" htmlFor="code">
                6-digit code
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
                className="input text-center text-xl tracking-[0.4em]"
              />
              <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? "Verifying…" : "Turn on 2-factor"}
              </button>
            </form>
          </>
        ) : (
          !error && <p className="text-center text-text-2">Preparing…</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
