"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { NewAccountForm } from "../import/import-client";

export function AddAccount({ institutions }: { institutions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button className="btn btn-secondary" onClick={() => setOpen((v) => !v)}>
        {open ? "Cancel" : "Add account"}
      </button>
      {open && (
        <NewAccountForm
          institutions={institutions}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Manual (CSV) accounts: the owner types in the current balance from the bank. */
export function BalanceEditor({
  accountId,
  balanceCents,
  name,
}: {
  accountId: string;
  balanceCents: number;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!editing) {
    return (
      <button
        className="tap text-xs font-semibold text-accent underline"
        onClick={() => setEditing(true)}
        aria-label={`Update balance for ${name}`}
      >
        Update balance
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = Number(new FormData(e.currentTarget).get("balance"));
        if (!Number.isFinite(v)) return setErr("Enter a number");
        try {
          await api(`/api/accounts/${accountId}`, {
            method: "PATCH",
            body: { balanceCents: Math.round(v * 100) },
          });
          setEditing(false);
          router.refresh();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <label htmlFor={`bal-${accountId}`} className="sr-only">
        Balance for {name} (owed on cards is negative)
      </label>
      <input
        id={`bal-${accountId}`}
        name="balance"
        inputMode="decimal"
        defaultValue={(balanceCents / 100).toFixed(2)}
        className="input h-11 w-32 text-right"
      />
      <button className="btn btn-primary">Save</button>
      {err && (
        <span role="alert" className="text-xs text-bad">
          {err}
        </span>
      )}
    </form>
  );
}
