"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

type Mode = "SHARED" | "BALANCE_ONLY" | "HIDDEN";

/** Owner-only: Shared (default) / Private – balance only / Private – hidden. */
export function VisibilityControl({
  accountId,
  initial,
  name,
}: {
  accountId: string;
  initial: Mode;
  name: string;
}) {
  const [mode, setMode] = useState<Mode>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`vis-${accountId}`} className="sr-only">
        Visibility for {name}
      </label>
      <select
        id={`vis-${accountId}`}
        data-testid="visibility-select"
        className="input h-11 w-auto py-0 text-sm"
        value={mode}
        disabled={saving}
        onChange={async (e) => {
          const next = e.target.value as Mode;
          const prev = mode;
          setMode(next);
          setSaving(true);
          setError(null);
          try {
            await api(`/api/accounts/${accountId}`, {
              method: "PATCH",
              body:
                next === "SHARED"
                  ? { visibility: "SHARED" }
                  : { visibility: "PRIVATE", privateMode: next },
            });
          } catch (err) {
            setMode(prev);
            setError(err instanceof Error ? err.message : "Couldn't save");
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="SHARED">Shared</option>
        <option value="BALANCE_ONLY">Private · balance only</option>
        <option value="HIDDEN">Private · hidden</option>
      </select>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
