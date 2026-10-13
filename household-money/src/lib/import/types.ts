/** A transaction row parsed from a CSV/PDF, before it's tied to an account. */
export interface ParsedRow {
  /** YYYY-MM-DD */
  date: string;
  /** Signed cents from the account's perspective: negative = money out (purchase/debit). */
  amountCents: number;
  /** Original description text */
  description: string;
  currency?: string;
  /** Card last 4 when the export includes it (multi-card statements) */
  cardLast4?: string;
  /** Cardholder name when the export includes it (who spent it) */
  cardholder?: string;
  /** Institution's own transaction type, e.g. PURCHASE / PAYMENT / Dividends */
  rawType?: string;
  /** Category the parser is sure about (e.g. investment dividends, fees) */
  categoryHint?: string;
  /** Parser knows this is a transfer (e.g. brokerage deposit, trade settlement) */
  transferHint?: boolean;
  /** 0..1 parse confidence; PDF rows are lower and always shown for review */
  confidence: number;
}

export type AccountTypeHint = "CHEQUING" | "CREDIT_CARD" | "INVESTMENT" | "UNKNOWN";

export interface ParseResult {
  /** Format key, e.g. "td", "rogers", "pdf-statement" */
  format: string;
  institution: string | null;
  accountType: AccountTypeHint;
  /** Account identifier last-4 found in the file (for auto-matching), if any */
  accountLast4?: string;
  rows: ParsedRow[];
  warnings: string[];
}

export class ImportParseError extends Error {}
