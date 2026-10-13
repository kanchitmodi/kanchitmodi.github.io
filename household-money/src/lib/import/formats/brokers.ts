import type { ParsedRow } from "../types";
import { last4, parseAmount, parseDate } from "../normalize";
import { columnMap, findHeader, nonEmpty, type CsvFormat } from "./shared";

/** Map brokerage activity to how the household reports should treat it. */
function classify(
  activity: string,
  description: string,
): Pick<ParsedRow, "categoryHint" | "transferHint"> {
  const a = `${activity} ${description}`.toLowerCase();
  if (/dividend|distribution|interest/.test(a) && !/withholding|tax/.test(a))
    return { categoryHint: "Income" };
  if (/withholding|tax/.test(a)) return { categoryHint: "Fees" };
  if (/fee|commission|rebate/.test(a) && !/trade|buy|sell/.test(a)) return { categoryHint: "Fees" };
  // Deposits, withdrawals, contributions, trades, FX conversions move money, they aren't spending.
  return { categoryHint: "Transfers", transferHint: true };
}

/**
 * Questrade "Account activity" export:
 *   Transaction Date, Settlement Date, Action, Symbol, Description, Quantity, Price, Gross Amount,
 *   Commission, Net Amount, Currency, Account #, Activity Type, Account Type
 * Net Amount is signed from the cash perspective.
 */
export const questrade: CsvFormat = {
  key: "questrade",
  institution: "Questrade",
  detect(grid) {
    return findHeader(grid, [
      "transaction date",
      "action",
      "symbol",
      "net amount",
      "activity type",
    ]) >= 0
      ? 0.95
      : 0;
  },
  parse(grid) {
    const h = findHeader(grid, [
      "transaction date",
      "action",
      "symbol",
      "net amount",
      "activity type",
    ]);
    const col = columnMap(grid[h]!);
    const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]!] ?? "").trim() : "");
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let acct: string | undefined;
    for (const r of nonEmpty(grid.slice(h + 1))) {
      const date =
        parseDate(get(r, "transaction date"), "YMD") ??
        parseDate(get(r, "transaction date"), "MDY");
      const net = parseAmount(get(r, "net amount"));
      if (!date || net === null) {
        warnings.push(`Skipped row: ${r.join(",").slice(0, 80)}`);
        continue;
      }
      if (net === 0) continue; // e.g. journalling with no cash effect
      acct ??= last4(get(r, "account #"));
      const activity = get(r, "activity type");
      const symbol = get(r, "symbol");
      const desc = [activity, get(r, "action"), symbol, get(r, "description")]
        .filter(Boolean)
        .join(" ")
        .slice(0, 140);
      rows.push({
        date,
        description: desc,
        amountCents: net,
        currency: get(r, "currency") || undefined,
        rawType: activity,
        confidence: 1,
        ...classify(activity, get(r, "description")),
      });
    }
    return { rows, accountType: "INVESTMENT", accountLast4: acct, warnings };
  },
};

/**
 * IBKR. Two exports:
 *  - Activity Statement CSV (Client Portal > Statements): multi-section rows
 *      "<Section>,Header,..." / "<Section>,Data,<Currency>,<Date>,<Description>,<Amount>"
 *    for Dividends, Withholding Tax, Deposits & Withdrawals, Fees, Interest.
 *  - Flex Query "Cash Transactions" CSV with headers incl. Date/Time (or SettleDate), Description,
 *    Amount, Type, CurrencyPrimary (or Currency).
 */
const IBKR_CASH_SECTIONS = [
  "Dividends",
  "Withholding Tax",
  "Deposits & Withdrawals",
  "Fees",
  "Interest",
];

export const ibkr: CsvFormat = {
  key: "ibkr",
  institution: "IBKR",
  detect(grid) {
    if (grid.some((r) => r[0] === "Statement" && r[1] === "Header")) return 0.95;
    if (
      findHeader(grid, ["description", "amount", "type"]) >= 0 &&
      grid.some((r) => r.some((c) => /^(ClientAccountID|CurrencyPrimary)$/.test(c)))
    )
      return 0.9;
    return 0;
  },
  parse(grid) {
    const rows: ParsedRow[] = [];
    const warnings: string[] = [];
    let acct: string | undefined;
    if (grid.some((r) => r[0] === "Statement" && r[1] === "Header")) {
      for (const r of grid) {
        if (r[0] === "Account Information" && r[1] === "Data" && /^Account$/i.test(r[2] ?? ""))
          acct = last4(r[3]);
        if (!IBKR_CASH_SECTIONS.includes(r[0] ?? "") || r[1] !== "Data") continue;
        const [section, , currency = "", rawDate = "", description = "", amount = ""] = r;
        if (/^total/i.test(currency)) continue;
        const date = parseDate(rawDate, "YMD");
        const amt = parseAmount(amount);
        if (!date || amt === null || amt === 0) continue;
        rows.push({
          date,
          description: description.slice(0, 140),
          amountCents: amt,
          currency,
          rawType: section,
          confidence: 1,
          ...classify(section!, description),
        });
      }
      return { rows, accountType: "INVESTMENT", accountLast4: acct, warnings };
    }
    const h = findHeader(grid, ["description", "amount", "type"]);
    const col = columnMap(grid[h]!);
    const get = (r: string[], k: string) => (col[k] !== undefined ? (r[col[k]!] ?? "").trim() : "");
    for (const r of nonEmpty(grid.slice(h + 1))) {
      const rawDate = get(r, "date/time") || get(r, "settledate") || get(r, "date");
      const date = parseDate(rawDate.slice(0, 10), "YMD") ?? parseDate(rawDate, "YMD");
      const amt = parseAmount(get(r, "amount"));
      if (!date || amt === null || amt === 0) continue;
      acct ??= last4(get(r, "clientaccountid"));
      const type = get(r, "type");
      rows.push({
        date,
        description: get(r, "description").slice(0, 140),
        amountCents: amt,
        currency: get(r, "currencyprimary") || get(r, "currency") || undefined,
        rawType: type,
        confidence: 1,
        ...classify(type, get(r, "description")),
      });
    }
    return { rows, accountType: "INVESTMENT", accountLast4: acct, warnings };
  },
};
