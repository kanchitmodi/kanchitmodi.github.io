"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { clearOfflineCache } from "@/components/pwa";

export function DataActions({ isOwner }: { isOwner: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="font-semibold">Export</h2>
        <p className="mb-3 text-sm text-text-2">
          Download your accounts, joint accounts and their transactions as JSON.
        </p>
        <a className="btn btn-secondary" href="/api/me/export">
          Download export
        </a>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">Delete my accounts</h2>
        <p className="mb-3 text-sm text-text-2">
          Permanently deletes your individual accounts and their transactions. Joint accounts are
          kept.
        </p>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (
              !confirm(
                "Delete all of your individual accounts and their transactions? This can't be undone.",
              )
            )
              return;
            const r = await api<{ deletedAccounts: number }>("/api/me/data", { method: "DELETE" });
            setMsg(`Deleted ${r.deletedAccounts} accounts.`);
          }}
        >
          Delete my accounts
        </button>
      </section>
      {!isOwner && (
        <section className="card p-4">
          <h2 className="font-semibold">Leave household</h2>
          <p className="mb-3 text-sm text-text-2">
            Removes you and your individual accounts from this household.
          </p>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("Leave this household? Your individual accounts will be removed."))
                return;
              await api("/api/household/leave", { body: {} });
              await clearOfflineCache();
              window.location.href = "/login";
            }}
          >
            Leave household
          </button>
        </section>
      )}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
