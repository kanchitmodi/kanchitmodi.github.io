import type { ParsedRow } from "../types";
import { last4, parseAmount, parseDate } from "../normalize";
import {
  columnMap,
  findHeader,
  nonEmpty,
  norm,
  PAYMENT_WORDS,
  type CsvFormat,
  type Grid,
} from "./shared";

const isMdy = (s: string | undefined) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test((s ?? "").trim());
const isYmd = (s: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test((s ?? "").trim());
const numOrEmpty = (s: string | undefined) => (s ?? "").trim() === "" || parseAmount(s) !== null;

/**
 * TD EasyWeb "Download transactions" (no header):
 *   MM/DD/YYYY, Description, Debit, Credit, Balance
 * Same layout for chequing and TD credit cards (debit = purchase, credit = payment).
 */
export const td: CsvFormat = {
  key: "td",
  institution: "TD",
  detect(grid) {
    const rows = nonEmpty(grid).slice(0, 10);
    if (rows.length === 0) return 0;
    const ok = rows.every(
      (r) => r.length >= 4 && r.length <= 5 && isMdy(r[0]) && numOrEmpty(r[2]) && numOrEmpty(r[3]),
    );
    return ok ? 0.8 : 0;
  },
  parse(grid) {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    for (const r of nonEmpty(grid)) {
      const date = parseDate(r[0]!, "MDY");
      const debit = parseAmount(r[2]);
      const credit = parseAmount(r[3]);
      if (!date || (debit === null && credit === null)) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      rows.push({
        date,
        description: r[1]!.trim(),
        amountCents: (credit ?? 0) - (debit ?? 0),
        confidence: 1,
      });
    }
    return { rows, accountType: "UNKNOWN", warnings };
  },
};

/**
 * CIBC Online Banking "Download transactions" (no header):
 *   YYYY-MM-DD, Description, Debit, Credit[, Card number (credit cards)]
 */
export const cibc: CsvFormat = {
  key: "cibc",
  institution: "CIBC",
  detect(grid) {
    const rows = nonEmpty(grid).slice(0, 10);
    if (rows.length === 0) return 0;
    const ok = rows.every(
      (r) => r.length >= 4 && r.length <= 5 && isYmd(r[0]) && numOrEmpty(r[2]) && numOrEmpty(r[3]),
    );
    return ok ? 0.8 : 0;
  },
  parse(grid) {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let card: string | undefined;
    for (const r of nonEmpty(grid)) {
      const date = parseDate(r[0]!, "YMD");
      const debit = parseAmount(r[2]);
      const credit = parseAmount(r[3]);
      if (!date || (debit === null && credit === null)) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      const c4 = last4(r[4]);
      card ??= c4;
      rows.push({
        date,
        description: r[1]!.trim(),
        amountCents: (credit ?? 0) - (debit ?? 0),
        cardLast4: c4,
        confidence: 1,
      });
    }
    return { rows, accountType: card ? "CREDIT_CARD" : "UNKNOWN", accountLast4: card, warnings };
  },
};

/**
 * Scotiabank. Two layouts:
 *  - Current Scotia OnLine export with header: Filter, Date, Description, Sub-description, Status,
 *    Type of Transaction, Amount  (Amount unsigned; Type is Debit/Credit)
 *  - Legacy (no header): MM/DD/YYYY, signed amount, "-", TYPE, Description
 */
export const scotiabank: CsvFormat = {
  key: "scotiabank",
  institution: "Scotiabank",
  detect(grid) {
    if (findHeader(grid, ["date", "description", "type of transaction", "amount"]) >= 0)
      return 0.95;
    const rows = nonEmpty(grid).slice(0, 10);
    if (
      rows.length &&
      rows.every(
        (r) => r.length >= 5 && isMdy(r[0]) && parseAmount(r[1]) !== null && r[2]!.trim() === "-",
      )
    )
      return 0.9;
    return 0;
  },
  parse(grid) {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    const h = findHeader(grid, ["date", "description", "type of transaction", "amount"]);
    if (h >= 0) {
      const col = columnMap(grid[h]!);
      for (const r of nonEmpty(grid.slice(h + 1))) {
        const date = parseDate(r[col["date"]!] ?? "", "MDY");
        const amt = parseAmount(r[col["amount"]!]);
        if (!date || amt === null) {
          warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
          continue;
        }
        const type = norm(r[col["type of transaction"]!]);
        const sub =
          col["sub-description"] !== undefined ? (r[col["sub-description"]!] ?? "").trim() : "";
        const desc = [(r[col["description"]!] ?? "").trim(), sub].filter(Boolean).join(" ");
        const signed = type === "credit" ? Math.abs(amt) : type === "debit" ? -Math.abs(amt) : amt;
        rows.push({
          date,
          description: desc,
          amountCents: signed,
          rawType: r[col["type of transaction"]!],
          confidence: 1,
        });
      }
      return { rows, accountType: "UNKNOWN", warnings };
    }
    for (const r of nonEmpty(grid)) {
      const date = parseDate(r[0]!, "MDY");
      const amt = parseAmount(r[1]);
      if (!date || amt === null) continue;
      rows.push({
        date,
        description: [r[3], r[4]]
          .map((x) => (x ?? "").trim())
          .filter(Boolean)
          .join(" "),
        amountCents: amt,
        rawType: r[3],
        confidence: 1,
      });
    }
    return { rows, accountType: "UNKNOWN", warnings };
  },
};

/**
 * Wealthsimple. Cash/chequing statement CSV: date, transaction, description, amount, balance
 * (signed amounts). Credit card CSV: transaction_date, post_date, type, details, amount, currency
 * (amount unsigned; type Purchase / Payment / Refund).
 */
export const wealthsimple: CsvFormat = {
  key: "wealthsimple",
  institution: "Wealthsimple",
  detect(grid) {
    if (findHeader(grid, ["transaction_date", "type", "details", "amount"]) >= 0) return 0.95;
    if (findHeader(grid, ["date", "transaction", "description", "amount", "balance"]) >= 0)
      return 0.9;
    return 0;
  },
  parse(grid) {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let h = findHeader(grid, ["transaction_date", "type", "details", "amount"]);
    if (h >= 0) {
      const col = columnMap(grid[h]!);
      for (const r of nonEmpty(grid.slice(h + 1))) {
        const date = parseDate(r[col["transaction_date"]!] ?? "", "YMD");
        const amt = parseAmount(r[col["amount"]!]);
        if (!date || amt === null) {
          warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
          continue;
        }
        const type = (r[col["type"]!] ?? "").trim();
        const inflow = /payment|refund|credit|cashback|reward/i.test(type);
        rows.push({
          date,
          description: (r[col["details"]!] ?? "").trim(),
          amountCents: inflow ? Math.abs(amt) : -Math.abs(amt),
          currency:
            col["currency"] !== undefined
              ? (r[col["currency"]!] ?? "").trim() || undefined
              : undefined,
          rawType: type,
          confidence: 1,
        });
      }
      return { rows, accountType: "CREDIT_CARD", warnings };
    }
    h = findHeader(grid, ["date", "transaction", "description", "amount", "balance"]);
    const col = columnMap(grid[h]!);
    for (const r of nonEmpty(grid.slice(h + 1))) {
      const date = parseDate(r[col["date"]!] ?? "", "YMD");
      const amt = parseAmount(r[col["amount"]!]);
      if (!date || amt === null) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      const type = (r[col["transaction"]!] ?? "").trim();
      rows.push({
        date,
        description: (r[col["description"]!] ?? "").trim() || type,
        amountCents: amt,
        rawType: type,
        confidence: 1,
      });
    }
    return { rows, accountType: "CHEQUING", warnings };
  },
};

/**
 * PC Financial Mastercard: "Description","Type","Card Holder Name","Date","Time","Amount"
 * Amount sign varies by export version, so Type decides direction (PURCHASE out; PAYMENT/REFUND in).
 */
export const pcFinancial: CsvFormat = {
  key: "pc-financial",
  institution: "PC Financial",
  detect(grid) {
    return findHeader(grid, ["description", "type", "card holder name", "date", "amount"]) >= 0
      ? 0.95
      : 0;
  },
  parse(grid) {
    const h = findHeader(grid, ["description", "type", "card holder name", "date", "amount"]);
    const col = columnMap(grid[h]!);
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    for (const r of nonEmpty(grid.slice(h + 1))) {
      const date = parseDate(r[col["date"]!] ?? "", "MDY");
      const amt = parseAmount(r[col["amount"]!]);
      if (!date || amt === null) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      const type = (r[col["type"]!] ?? "").trim();
      const desc = (r[col["description"]!] ?? "").trim();
      const inflow = PAYMENT_WORDS.test(type) || /^payment/i.test(desc);
      rows.push({
        date,
        description: desc,
        amountCents: inflow ? Math.abs(amt) : -Math.abs(amt),
        cardholder: (r[col["card holder name"]!] ?? "").trim() || undefined,
        rawType: type,
        confidence: 1,
      });
    }
    return { rows, accountType: "CREDIT_CARD", warnings };
  },
};

/**
 * Rogers Bank Mastercard (online banking export):
 *   Date, Posted Date, Reference Number, Activity Type, Activity Status, Card Number,
 *   Merchant Category Description, Merchant Name, Merchant City, Merchant State or Province,
 *   Merchant Country Code, Merchant Postal Code, Amount, Rewards, Name on Card
 * Amount is positive for purchases and negative for payments/refunds.
 */
export const rogers: CsvFormat = {
  key: "rogers",
  institution: "Rogers Bank",
  detect(grid) {
    return findHeader(grid, ["date", "merchant name", "amount"]) >= 0 &&
      findHeader(grid, ["activity type"]) >= 0
      ? 0.95
      : 0;
  },
  parse(grid) {
    const h = findHeader(grid, ["date", "merchant name", "amount"]);
    const col = columnMap(grid[h]!);
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let card: string | undefined;
    const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]!] ?? "").trim() : "");
    for (const r of nonEmpty(grid.slice(h + 1))) {
      const date = parseDate(get(r, "date"), "YMD") ?? parseDate(get(r, "date"), "MDY");
      const amt = parseAmount(get(r, "amount"));
      if (!date || amt === null) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      if (/declined|pending/i.test(get(r, "activity status"))) continue;
      const c4 = last4(get(r, "card number"));
      card ??= c4;
      const merchant = get(r, "merchant name") || get(r, "activity type");
      const city = [get(r, "merchant city"), get(r, "merchant state or province")]
        .filter(Boolean)
        .join(" ");
      rows.push({
        date,
        description: [merchant, city].filter(Boolean).join(" "),
        amountCents: -amt,
        cardLast4: c4,
        cardholder: get(r, "name on card") || undefined,
        rawType: get(r, "activity type") || undefined,
        confidence: 1,
      });
    }
    return { rows, accountType: "CREDIT_CARD", accountLast4: card, warnings };
  },
};

/** Fallback: any CSV with recognizable Date / Description / Amount (or Debit+Credit) headers. */
export const generic: CsvFormat = {
  key: "generic",
  institution: "",
  detect(grid) {
    return headerGuess(grid) ? 0.3 : 0;
  },
  parse(grid) {
    const g = headerGuess(grid)!;
    const rows: ParsedRow[] = [];
    const warnings: string[] = [
      `Unrecognized bank format — columns guessed from headers. Check signs in the preview.`,
    ];
    for (const r of nonEmpty(grid.slice(g.header + 1))) {
      const date = parseDate(r[g.date] ?? "", "MDY");
      let amt: number | null = null;
      if (g.amount !== undefined) amt = parseAmount(r[g.amount]);
      else {
        const d = parseAmount(r[g.debit!]);
        const c = parseAmount(r[g.credit!]);
        if (d !== null || c !== null) amt = (c ?? 0) - Math.abs(d ?? 0);
      }
      if (!date || amt === null) continue;
      rows.push({ date, description: (r[g.desc] ?? "").trim(), amountCents: amt, confidence: 0.8 });
    }
    return { rows, accountType: "UNKNOWN", warnings };
  },
};

function headerGuess(grid: Grid) {
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const cells = grid[i]!.map(norm);
    const find = (re: RegExp) => {
      const idx = cells.findIndex((c) => re.test(c));
      return idx >= 0 ? idx : undefined;
    };
    const date = find(/^(transaction )?date|^posted|^date/);
    const desc = find(/description|merchant|payee|details|memo|name/);
    const amount = find(/^amount|^montant/);
    const debit = find(/debit|withdrawal/);
    const credit = find(/credit|deposit/);
    if (
      date !== undefined &&
      desc !== undefined &&
      (amount !== undefined || (debit !== undefined && credit !== undefined))
    ) {
      return { header: i, date, desc, amount, debit, credit };
    }
  }
  return null;
}

export type { Grid };
