"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, ClientApiError } from "@/lib/client-api";
import { formatCents } from "@/lib/money";

interface Acct {
  id: string;
  name: string;
  institution: string;
  type: string;
  mask: string | null;
  joint: boolean;
}

interface PreviewRow {
  index: number;
  date: string;
  description: string;
  merchant: string;
  amountCents: number;
  status: "new" | "duplicate";
  categoryGuess: string | null;
  confidence: number;
}

interface Preview {
  batchId: string;
  format: string;
  institution: string | null;
  accountType: string;
  accountLast4: string | null;
  warnings: string[];
  suggestedAccountId: string | null;
  rows: PreviewRow[];
}

interface CommitResult {
  imported: number;
  duplicates: number;
  skipped: number;
  transfers: number;
  categorized: number;
  llm: number;
  review: number;
}

const FORMAT_LABEL: Record<string, string> = {
  td: "TD",
  cibc: "CIBC",
  scotiabank: "Scotiabank",
  wealthsimple: "Wealthsimple",
  "pc-financial": "PC Financial",
  rogers: "Rogers Bank",
  questrade: "Questrade",
  ibkr: "IBKR",
  generic: "Generic CSV",
  "pdf-statement": "PDF statement",
};

export function ImportFlow({
  accounts: initial,
  institutions,
}: {
  accounts: Acct[];
  institutions: string[];
}) {
  const [accounts, setAccounts] = useState(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const rows = preview?.rows ?? [];
    const fresh = rows.filter((r) => r.status === "new" && !excluded.has(r.index));
    return {
      total: rows.length,
      toImport: fresh.length,
      dup: rows.filter((r) => r.status === "duplicate").length,
      verify: rows.filter((r) => r.confidence < 0.8).length,
    };
  }, [preview, excluded]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(null);
    setExcluded(new Set());
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/import/preview", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Couldn't read that file.");
      setPreview(json);
      setAccountId(json.suggestedAccountId ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseAccount(id: string) {
    setAccountId(id);
    if (!preview || !id) return;
    setBusy(true);
    try {
      const r = await api<{ rows: PreviewRow[] }>(`/api/import/${preview.batchId}/account`, {
        body: { accountId: id },
      });
      setPreview({ ...preview, rows: r.rows });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<CommitResult>(`/api/import/${preview.batchId}/commit`, {
        body: { accountId, exclude: [...excluded] },
      });
      setResult(r);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4" aria-labelledby="up-h">
        <h2 id="up-h" className="font-semibold">
          1. Choose a file
        </h2>
        <p className="mb-3 text-sm text-text-2">
          The file is read once to build a preview and is never stored. Export steps per bank are in
          Settings › Setup.
        </p>
        <label className="btn btn-primary cursor-pointer">
          {busy && !preview ? "Reading…" : "Choose CSV or PDF"}
          <input
            type="file"
            accept=".csv,.txt,.pdf,text/csv,application/pdf"
            className="sr-only"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
      </section>

      {result && (
        <section role="status" className="card p-4" data-testid="import-result">
          <h2 className="font-semibold">✓ Imported {result.imported} transactions</h2>
          <p className="mt-1 text-sm text-text-2">
            {result.duplicates} duplicates skipped · {result.skipped} excluded · {result.transfers}{" "}
            transfers/card payments matched · {result.categorized + result.llm} categorized
            {result.llm ? ` (${result.llm} by Claude)` : ""} · {result.review} need review
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/transactions" className="btn btn-secondary">
              View transactions
            </Link>
            {result.review > 0 && (
              <Link href="/transactions?review=1" className="btn btn-secondary">
                Review {result.review}
              </Link>
            )}
          </div>
        </section>
      )}

      {preview && (
        <section className="card p-4" aria-labelledby="acct-h">
          <h2 id="acct-h" className="font-semibold">
            2. Which account?
          </h2>
          <p className="mb-3 text-sm text-text-2">
            Detected <strong>{FORMAT_LABEL[preview.format] ?? preview.format}</strong>
            {preview.accountLast4 ? ` · account ending ${preview.accountLast4}` : ""} ·{" "}
            {counts.total} rows
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="import-account" className="sr-only">
              Account
            </label>
            <select
              id="import-account"
              className="input sm:flex-1"
              value={accountId}
              onChange={(e) => void chooseAccount(e.target.value)}
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ··${a.mask}` : ""}
                  {a.joint ? " (joint)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? "Cancel" : "New account"}
            </button>
          </div>
          {creating && (
            <NewAccountForm
              institutions={institutions}
              defaults={{
                institution: preview.institution ?? "",
                type: preview.accountType === "UNKNOWN" ? "CHEQUING" : preview.accountType,
                mask: preview.accountLast4 ?? "",
              }}
              onCreated={(a) => {
                setAccounts((xs) => [...xs, a]);
                setCreating(false);
                void chooseAccount(a.id);
              }}
            />
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="mt-2 text-sm text-warn">
              ▲ {w}
            </p>
          ))}
        </section>
      )}

      {preview && (
        <section className="card overflow-hidden" aria-labelledby="prev-h">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <h2 id="prev-h" className="font-semibold">
              3. Review and import
            </h2>
            <span className="text-sm text-text-2" data-testid="preview-counts">
              {counts.toImport} new · {counts.dup} duplicates
              {counts.verify ? ` · ${counts.verify} to verify` : ""}
            </span>
          </div>
          <div className="max-h-[28rem] overflow-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-text-2">
                  <th scope="col" className="p-2 pl-4 font-medium">
                    <span className="sr-only">Include</span>
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Date
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Merchant
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Category
                  </th>
                  <th scope="col" className="p-2 pr-4 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const dup = r.status === "duplicate";
                  return (
                    <tr
                      key={r.index}
                      className={`border-t border-border ${dup ? "text-text-3" : ""}`}
                      data-testid="preview-row"
                      data-status={r.status}
                    >
                      <td className="p-2 pl-4">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          aria-label={`Include ${r.merchant} on ${r.date}`}
                          disabled={dup}
                          checked={!dup && !excluded.has(r.index)}
                          onChange={(e) =>
                            setExcluded((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.delete(r.index);
                              else n.add(r.index);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.merchant}</div>
                        <div className="text-xs text-text-3">
                          {dup
                            ? "Already imported"
                            : r.confidence < 0.8
                              ? "▲ Verify this row"
                              : r.description}
                        </div>
                      </td>
                      <td className="p-2 text-text-2">{r.categoryGuess ?? "—"}</td>
                      <td className="p-2 pr-4 text-right whitespace-nowrap tabular-nums">
                        {formatCents(r.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
            <button
              className="btn btn-primary"
              disabled={busy || !accountId || counts.toImport === 0}
              onClick={() => void commit()}
            >
              {busy ? "Importing…" : `Import ${counts.toImport} transactions`}
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                await api(`/api/import/${preview.batchId}`, { method: "DELETE" }).catch(
                  () => undefined,
                );
                setPreview(null);
              }}
            >
              Discard
            </button>
            {!accountId && <span className="text-sm text-text-2">Choose an account first.</span>}
          </div>
        </section>
      )}
    </div>
  );
}

const TYPES = [
  ["CHEQUING", "Chequing"],
  ["SAVINGS", "Savings"],
  ["CREDIT_CARD", "Credit card"],
  ["INVESTMENT", "Investment"],
] as const;

export function NewAccountForm({
  institutions,
  defaults,
  onCreated,
}: {
  institutions: string[];
  defaults?: { institution?: string; type?: string; mask?: string };
  onCreated: (a: Acct) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(defaults?.type ?? "CHEQUING");
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2"
      data-testid="new-account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        try {
          const r = await api<{
            account: {
              id: string;
              name: string;
              institution: string;
              type: string;
              mask: string | null;
              ownerType: string;
            };
          }>("/api/accounts", {
            body: {
              name: f.get("name"),
              institution: f.get("institution"),
              type: f.get("type"),
              subtype: f.get("type") === "INVESTMENT" ? f.get("subtype") || undefined : undefined,
              mask: (f.get("mask") as string) || undefined,
              joint: f.get("joint") === "on",
              currency: f.get("currency"),
            },
          });
          onCreated({ ...r.account, joint: r.account.ownerType === "JOINT" });
        } catch (err) {
          setError(err instanceof ClientApiError ? err.message : "Couldn't create the account");
        }
      }}
    >
      <div>
        <label className="label" htmlFor="na-name">
          Account name
        </label>
        <input
          id="na-name"
          name="name"
          required
          maxLength={80}
          className="input"
          placeholder="e.g. TD Visa"
        />
      </div>
      <div>
        <label className="label" htmlFor="na-inst">
          Institution
        </label>
        <input
          id="na-inst"
          name="institution"
          required
          list="na-inst-list"
          defaultValue={defaults?.institution}
          className="input"
        />
        <datalist id="na-inst-list">
          {institutions.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="na-type">
          Type
        </label>
        <select
          id="na-type"
          name="type"
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {type === "INVESTMENT" && (
        <div>
          <label className="label" htmlFor="na-sub">
            Account type
          </label>
          <select id="na-sub" name="subtype" className="input">
            {["TFSA", "RRSP", "FHSA", "RESP", "NON_REG", "CASH"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", "-")}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="na-mask">
          Last 4 digits (optional)
        </label>
        <input
          id="na-mask"
          name="mask"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          defaultValue={defaults?.mask}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="na-cur">
          Currency
        </label>
        <select id="na-cur" name="currency" className="input" defaultValue="CAD">
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="joint" className="h-5 w-5" /> Joint account (shared by both of
        you — add it only once)
      </label>
      {error && (
        <p role="alert" className="text-sm text-bad sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button className="btn btn-primary">Create account</button>
      </div>
    </form>
  );
}
