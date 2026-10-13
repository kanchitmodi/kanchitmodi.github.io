import { monthFromAbbrev, parseAmount, parseDate } from "./normalize";
import type { ParseResult, ParsedRow } from "./types";

/**
 * Generic statement-PDF parser. Bank PDFs vary, so every row is shown in a preview for the user to
 * confirm (confidence < 1). Supported line shapes:
 *   "Oct 03  Oct 04  STARBUCKS #1234 TORONTO ON   5.25"        (credit card: txn + posting date)
 *   "Oct 03  STARBUCKS   5.25"
 *   "2026-10-03  STARBUCKS  -5.25"  /  "10/03/2026  STARBUCKS  5.25"
 * Trailing "CR" or "-" marks a credit.
 */

const AMT = String.raw`(-?\$?\(?[\d,]+\.\d{2}\)?-?(?:\s?CR)?)`;
const MON = String.raw`(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?`;
const LINE_MM_MM = new RegExp(
  String.raw`^${MON}\s+(\d{1,2})\s+${MON}\s+(\d{1,2})\s+(.+?)\s+${AMT}(?:\s+${AMT})?$`,
  "i",
);
const LINE_MM = new RegExp(String.raw`^${MON}\s+(\d{1,2}),?\s+(.+?)\s+${AMT}(?:\s+${AMT})?$`, "i");
const LINE_ISO = new RegExp(
  String.raw`^(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})\s+(.+?)\s+${AMT}(?:\s+${AMT})?$`,
);
const SKIP =
  /\b(previous balance|new balance|opening balance|closing balance|balance forward|total|subtotal|minimum payment|credit limit|available credit|interest rate|page \d)/i;

/** Statement end date: the latest full date mentioned near "statement"/"period"/"to". */
export function statementEnd(text: string): { year: number; month: number } | null {
  const dates: string[] = [];
  const re = /([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/g;
  for (const m of text.matchAll(re)) {
    const d = parseDate(m[1]!, "MDY");
    if (d) dates.push(d);
  }
  if (dates.length === 0) {
    const y = text.match(/\b(20\d{2})\b/);
    return y ? { year: +y[1]!, month: 12 } : null;
  }
  const latest = dates.sort().at(-1)!;
  return { year: +latest.slice(0, 4), month: +latest.slice(5, 7) };
}

function withYear(month: number, day: number, end: { year: number; month: number }): string | null {
  // A December transaction on a January statement belongs to the previous year.
  const year = month > end.month ? end.year - 1 : end.year;
  return parseDate(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    "YMD",
  );
}

export function parseStatementText(text: string): ParseResult {
  const isCard =
    /\b(mastercard|visa|amex|american express|credit card|minimum payment|credit limit)\b/i.test(
      text,
    );
  const end = statementEnd(text) ?? { year: new Date().getUTCFullYear(), month: 12 };
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 8 || SKIP.test(line)) continue;
    let date: string | null = null;
    let desc = "";
    let amountText = "";
    let m = line.match(LINE_MM_MM);
    if (m) {
      date = withYear(monthFromAbbrev(m[1]!)!, +m[2]!, end);
      desc = m[5]!;
      amountText = m[6]!;
    } else if ((m = line.match(LINE_ISO))) {
      date = parseDate(m[1]!, "MDY");
      desc = m[2]!;
      amountText = m[3]!;
    } else if ((m = line.match(LINE_MM))) {
      date = withYear(monthFromAbbrev(m[1]!)!, +m[2]!, end);
      desc = m[3]!;
      amountText = m[4]!;
    }
    if (!date) continue;
    const amt = parseAmount(amountText);
    if (amt === null || amt === 0) continue;
    // Card statements list charges as positive amounts; flip to money-out-is-negative.
    const signed = isCard ? -amt : amt;
    rows.push({ date, description: desc.trim(), amountCents: signed, confidence: 0.7 });
  }
  if (rows.length === 0)
    warnings.push("No transaction lines recognized in this PDF. Try the CSV export instead.");
  else
    warnings.push("PDF rows are parsed from statement text — review every row before importing.");
  return {
    format: "pdf-statement",
    institution: null,
    accountType: isCard ? "CREDIT_CARD" : "UNKNOWN",
    rows,
    warnings,
  };
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n");
}
