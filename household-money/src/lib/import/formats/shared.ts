import type { AccountTypeHint, ParsedRow } from "../types";

export type Grid = string[][];

export interface CsvFormat {
  key: string;
  institution: string;
  /** 0 = not this format; higher = more confident. */
  detect(grid: Grid): number;
  parse(grid: Grid): {
    rows: ParsedRow[];
    accountType: AccountTypeHint;
    accountLast4?: string;
    warnings: string[];
  };
}

export const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** Index of the first row that looks like a header containing all `required` column names. */
export function findHeader(grid: Grid, required: string[], scan = 10): number {
  for (let i = 0; i < Math.min(scan, grid.length); i++) {
    const cells = grid[i]!.map(norm);
    if (required.every((r) => cells.includes(r))) return i;
  }
  return -1;
}

export function columnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    map[norm(h)] = i;
  });
  return map;
}

export function nonEmpty(grid: Grid): Grid {
  return grid.filter((r) => r.some((c) => c.trim() !== ""));
}

export const PAYMENT_WORDS =
  /\b(PAYMENT|PAIEMENT|THANK YOU|MERCI|AUTOPAY|REFUND|RETURN|CREDIT|REBATE|CASHBACK|CASH BACK|REVERSAL)\b/i;
