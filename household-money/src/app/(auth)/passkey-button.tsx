"use client";

import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

/** Passkey / Face ID button. mode=login creates a session; mode=unlock unlocks the current one. */
export function PasskeyButton({
  mode,
  onDone,
  onError,
}: {
  mode: "login" | "unlock";
  onDone: (next: string) => void;
  onError: (m: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;
  const base = mode === "login" ? "/api/auth/passkey/login" : "/api/auth/unlock/passkey";
  return (
    <button
      type="button"
      className="btn btn-secondary w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const optionsJSON = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
            `${base}/options`,
            { body: {} },
          );
          const response = await startAuthentication({ optionsJSON });
          const r = await api<{ next?: string }>(`${base}/verify`, { body: { response } });
          onDone(r.next ?? "/");
        } catch (e) {
          onError(e instanceof Error ? e.message : "Passkey sign-in failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      Use Face ID / passkey
    </button>
  );
}
