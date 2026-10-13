"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { formatCents } from "@/lib/money";
import { Avatar } from "@/components/avatar";

interface Split {
  categoryId: string | null;
  amountCents: number;
  note: string | null;
}

interface Props {
  txn: {
    id: string;
    amountCents: number;
    merchant: string;
    notes: string | null;
    isTransfer: boolean;
    needsReview: boolean;
    categoryId: string | null;
    splits: Split[];
  };
  categories: { id: string; name: string }[];
  comments: {
    id: string;
    body: string;
    createdAt: string;
    user: { name: string; avatarColor: string };
  }[];
  history: {
    id: string;
    field: string;
    from: string | null;
    to: string | null;
    at: string;
    by: string;
  }[];
}

const toDollars = (c: number) => (Math.abs(c) / 100).toFixed(2);
const toCents = (s: string, sign: number) => Math.round(Math.abs(Number(s || "0")) * 100) * sign;

export function TxnEditor({ txn, categories, comments, history }: Props) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? "");
  const [applyAll, setApplyAll] = useState(true);
  const [notes, setNotes] = useState(txn.notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sign = Math.sign(txn.amountCents) || -1;
  const [splitting, setSplitting] = useState(txn.splits.length > 0);
  const [parts, setParts] = useState<{ categoryId: string; amount: string; note: string }[]>(
    txn.splits.length
      ? txn.splits.map((s) => ({
          categoryId: s.categoryId ?? "",
          amount: toDollars(s.amountCents),
          note: s.note ?? "",
        }))
      : [
          { categoryId: txn.categoryId ?? "", amount: toDollars(txn.amountCents), note: "" },
          { categoryId: "", amount: "0.00", note: "" },
        ],
  );
  const remaining = txn.amountCents - parts.reduce((s, p) => s + toCents(p.amount, sign), 0);

  async function save(body: object, ok: string) {
    setErr(null);
    setMsg(null);
    try {
      const r = await api<{ learned?: { updated: number } | null }>(`/api/transactions/${txn.id}`, {
        method: "PATCH",
        body,
      });
      setMsg(
        r.learned
          ? `${ok} Rule saved — ${r.learned.updated} other ${txn.merchant} transaction(s) updated.`
          : ok,
      );
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3 p-4" aria-labelledby="cat-h">
        <h2 id="cat-h" className="font-semibold">
          Category
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="category" className="sr-only">
            Category
          </label>
          <select
            id="category"
            className="input sm:flex-1"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={txn.isTransfer || splitting}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={txn.isTransfer || splitting}
            onClick={() =>
              void save(
                { categoryId: categoryId || null, applyToMerchant: applyAll && !!categoryId },
                txn.needsReview && categoryId === (txn.categoryId ?? "") ? "Confirmed." : "Saved.",
              )
            }
          >
            {txn.needsReview && categoryId === (txn.categoryId ?? "") ? "Confirm" : "Save"}
          </button>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
          />
          Always categorize <strong>{txn.merchant}</strong> this way (creates a rule)
        </label>
        <label className="flex min-h-[44px] items-center gap-2 border-t border-border pt-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={txn.isTransfer}
            onChange={(e) =>
              void save(
                { isTransfer: e.target.checked },
                e.target.checked
                  ? "Marked as a transfer — excluded from spending."
                  : "No longer a transfer.",
              )
            }
          />
          Transfer between our own accounts / card payment (not spending)
        </label>
        {msg && (
          <p role="status" className="text-sm text-good">
            {msg}
          </p>
        )}
        {err && (
          <p role="alert" className="text-sm text-bad">
            {err}
          </p>
        )}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="split-h">
        <div className="flex items-center justify-between">
          <h2 id="split-h" className="font-semibold">
            Split
          </h2>
          <button
            className="btn btn-secondary"
            onClick={() => setSplitting((v) => !v)}
            disabled={txn.isTransfer}
          >
            {splitting ? "Cancel" : "Split across categories"}
          </button>
        </div>
        {splitting ? (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await api(`/api/transactions/${txn.id}/splits`, {
                  method: "PUT",
                  body: {
                    splits: parts.map((p) => ({
                      categoryId: p.categoryId || null,
                      amountCents: toCents(p.amount, sign),
                      note: p.note || null,
                    })),
                  },
                });
                setMsg("Split saved.");
                router.refresh();
              } catch (e2) {
                setErr((e2 as Error).message);
              }
            }}
          >
            {parts.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_7rem_auto] items-center gap-2"
                data-testid="split-part"
              >
                <label className="sr-only" htmlFor={`sc-${i}`}>
                  Part {i + 1} category
                </label>
                <select
                  id={`sc-${i}`}
                  className="input"
                  value={p.categoryId}
                  onChange={(e) =>
                    setParts((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`sa-${i}`}>
                  Part {i + 1} amount
                </label>
                <input
                  id={`sa-${i}`}
                  className="input text-right"
                  inputMode="decimal"
                  value={p.amount}
                  onChange={(e) =>
                    setParts((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="tap text-text-3"
                  aria-label={`Remove part ${i + 1}`}
                  disabled={parts.length <= 2}
                  onClick={() => setParts((xs) => xs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setParts((xs) => [
                    ...xs,
                    { categoryId: "", amount: toDollars(remaining), note: "" },
                  ])
                }
              >
                Add part
              </button>
              <span
                className={remaining === 0 ? "text-good" : "text-warn"}
                data-testid="split-remaining"
              >
                {remaining === 0
                  ? "✓ Adds up"
                  : `${formatCents(Math.abs(remaining))} left to assign`}
              </span>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={remaining !== 0}>
                Save split
              </button>
              {txn.splits.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => {
                    await api(`/api/transactions/${txn.id}/splits`, {
                      method: "PUT",
                      body: { splits: [] },
                    });
                    setSplitting(false);
                    router.refresh();
                  }}
                >
                  Remove split
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="text-sm text-text-2">
            Split one purchase across categories, e.g. a Costco run that was half groceries, half
            household.
          </p>
        )}
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="notes-h">
        <h2 id="notes-h" className="font-semibold">
          Notes
        </h2>
        <label htmlFor="notes" className="sr-only">
          Notes
        </label>
        <textarea
          id="notes"
          className="input min-h-[88px] py-2"
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => void save({ notes }, "Note saved.")}>
          Save note
        </button>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="comments-h">
        <h2 id="comments-h" className="font-semibold">
          Comments
        </h2>
        <ul className="space-y-3" data-testid="comments">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2 text-sm">
              <Avatar name={c.user.name} color={c.user.avatarColor} size={24} />
              <div>
                <div className="text-xs text-text-3">
                  <strong className="text-text">{c.user.name}</strong> ·{" "}
                  {new Date(c.createdAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}
                </div>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
          {comments.length === 0 && <li className="text-sm text-text-2">No comments yet.</li>}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("comment") ?? "");
            if (!body.trim()) return;
            await api(`/api/transactions/${txn.id}/comments`, { body: { body } });
            form.reset();
            router.refresh();
          }}
        >
          <label htmlFor="comment" className="sr-only">
            Add a comment
          </label>
          <input
            id="comment"
            name="comment"
            maxLength={1000}
            placeholder="Add a comment…"
            className="input flex-1"
          />
          <button className="btn btn-secondary">Post</button>
        </form>
      </section>

      <section className="card p-4 lg:col-span-2" aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-2 font-semibold">
          History
        </h2>
        <ul className="space-y-1 text-sm" data-testid="history">
          {history.map((h) => (
            <li key={h.id} className="text-text-2">
              <strong className="text-text">{h.by}</strong> changed {h.field}
              {h.field === "notes" ? "" : ` from ${h.from ?? "—"} to ${h.to ?? "—"}`} ·{" "}
              {new Date(h.at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}
            </li>
          ))}
          {history.length === 0 && <li className="text-text-2">No edits yet.</li>}
        </ul>
      </section>
    </div>
  );
}
