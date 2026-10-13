import { createHash } from "node:crypto";
import { normalizeMerchant } from "./normalize";

/** Dedupe identity: (account, date, amount, normalized merchant). */
export function dedupeKey(
  accountId: string,
  date: string,
  amountCents: number,
  merchantNorm: string,
): string {
  return `${accountId}|${date}|${amountCents}|${merchantNorm}`;
}

export interface PlannedRow<T> {
  row: T;
  merchantNorm: string;
  key: string;
  /** Stable per-row id: re-importing the same file produces the same ids */
  externalId: string;
  duplicate: boolean;
}

/**
 * Decide which rows are new. Multiset semantics: two identical $5.25 coffees on the same day are
 * both kept, unless the account already has two. Existing rows from ANY source (Plaid, email,
 * earlier CSVs) count, so the same purchase never lands twice.
 */
export function planImport<T extends { date: string; amountCents: number; description: string }>(
  accountId: string,
  rows: T[],
  existingKeyCounts: Map<string, number>,
  source = "csv",
): PlannedRow<T>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const merchantNorm = normalizeMerchant(row.description);
    const key = dedupeKey(accountId, row.date, row.amountCents, merchantNorm);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const externalId = `${source}:${createHash("sha256").update(`${key}#${n}`).digest("hex").slice(0, 32)}`;
    return { row, merchantNorm, key, externalId, duplicate: n < (existingKeyCounts.get(key) ?? 0) };
  });
}
