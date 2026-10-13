"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { clearOfflineCache } from "@/components/pwa";

interface PasskeyRow {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function PasskeyManager({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  return (
    <section className="card p-4" aria-labelledby="pk-h">
      <h2 id="pk-h" className="font-semibold">
        Passkeys (Face ID / Touch ID)
      </h2>
      <ul className="my-3 divide-y divide-border" data-testid="passkey-list">
        {passkeys.map((p) => (
          <li
            key={p.id}
            className="flex min-h-[48px] items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              {p.deviceName}
              <span className="block text-xs text-text-3">
                Added {p.createdAt}
                {p.lastUsedAt ? ` · last used ${p.lastUsedAt}` : ""}
              </span>
            </span>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api(`/api/me/passkeys/${p.id}`, { method: "DELETE" });
                router.refresh();
              }}
            >
              Remove
            </button>
          </li>
        ))}
        {passkeys.length === 0 && <li className="py-2 text-sm text-text-2">No passkeys yet.</li>}
      </ul>
      {supported ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const deviceName = String(new FormData(e.currentTarget).get("deviceName") || "Passkey");
            setBusy(true);
            setMsg(null);
            try {
              const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
                "/api/auth/passkey/register/options",
                { body: {} },
              );
              const response = await startRegistration({ optionsJSON });
              await api("/api/auth/passkey/register/verify", { body: { response, deviceName } });
              setMsg("Passkey added.");
              router.refresh();
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Couldn't add passkey");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="deviceName" className="sr-only">
            Device name
          </label>
          <input
            id="deviceName"
            name="deviceName"
            placeholder="e.g. Kanchit's iPhone"
            maxLength={60}
            className="input sm:flex-1"
          />
          <button className="btn btn-primary" disabled={busy}>
            Add passkey
          </button>
        </form>
      ) : (
        <p className="text-sm text-text-2">This browser doesn&apos;t support passkeys.</p>
      )}
      {msg && (
        <p role="status" className="mt-2 text-sm">
          {msg}
        </p>
      )}
    </section>
  );
}

export function SignOutButton() {
  return (
    <button
      className="btn btn-secondary w-full sm:w-auto"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        await clearOfflineCache();
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
