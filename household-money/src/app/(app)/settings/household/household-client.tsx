"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/** Stays mounted after the household fills up so the one-time invite link remains visible. */
export function InviteForm({ canInvite }: { canInvite: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canInvite && !link) return null;
  return (
    <section className="card mb-4 p-4" aria-labelledby="inv-h">
      <h2 id="inv-h" className="font-semibold">
        Invite a member
      </h2>
      <p className="mb-3 text-sm text-text-2">
        They&apos;ll create their own password, 2-factor and Face ID, and connect their own
        accounts.
      </p>
      {canInvite && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const r = await api<{ link: string; emailed: boolean }>("/api/household/invites", {
                body: { email: new FormData(e.currentTarget).get("email") },
              });
              setLink(r.link);
              setEmailed(r.emailed);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Invite failed");
            }
          }}
        >
          <label htmlFor="invite-email" className="sr-only">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="her@email.com"
            className="input sm:flex-1"
          />
          <button className="btn btn-primary">Send invite</button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
      {link && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm" role="status">
          {emailed
            ? "Invite emailed. "
            : "Email isn't configured — share this link directly (shown once, expires in 7 days): "}
          <code data-testid="invite-link" className="mt-1 block break-all">
            {link}
          </code>
        </div>
      )}
    </section>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-danger"
      onClick={async () => {
        await api(`/api/household/invites/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      Revoke
    </button>
  );
}

export function JointSplitForm({ initial, ownerName }: { initial: number; ownerName: string }) {
  const [pct, setPct] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Joint account split</h2>
      <p className="mb-3 text-sm text-text-2">
        How joint balances are attributed in per-person net worth.
      </p>
      <form
        className="flex items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/household", { method: "PATCH", body: { jointSplitPct: pct } });
          setSaved(true);
        }}
      >
        <label htmlFor="split" className="text-sm">
          {ownerName}
        </label>
        <input
          id="split"
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => {
            setPct(Number(e.target.value));
            setSaved(false);
          }}
          className="input w-24"
        />
        <span className="text-sm">% / {100 - pct}%</span>
        <button className="btn btn-secondary">Save</button>
        {saved && (
          <span role="status" className="text-sm text-good">
            Saved
          </span>
        )}
      </form>
    </section>
  );
}
