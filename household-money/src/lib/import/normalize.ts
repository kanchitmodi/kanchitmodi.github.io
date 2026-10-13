/**
 * Merchant normalization: the key for dedupe and categorization rules.
 * "SQ *STARBUCKS #1234 TORONTO ON" -> "STARBUCKS"
 */

const PROVINCES = "AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT";
const PREFIXES =
  /^(SQ \*|SQU\*|TST\* ?|TST-|SP \* ?|SP\*|PP\*|PAYPAL \*|POS PURCHASE |POS |IDP PURCHASE |PURCHASE |INTERAC PURCHASE |VISA DEBIT PURCHASE |FPOS |APOS |OPOS )/;
/** Cities stripped from the end even without a province code (statement/alert variants). */
const CITIES = [
  "NORTH YORK",
  "RICHMOND HILL",
  "ST CATHARINES",
  "NIAGARA FALLS",
  "THUNDER BAY",
  "EAST YORK",
  "TORONTO",
  "MISSISSAUGA",
  "BRAMPTON",
  "MARKHAM",
  "VAUGHAN",
  "OAKVILLE",
  "BURLINGTON",
  "ETOBICOKE",
  "SCARBOROUGH",
  "OTTAWA",
  "HAMILTON",
  "LONDON",
  "KITCHENER",
  "WATERLOO",
  "GUELPH",
  "OSHAWA",
  "WHITBY",
  "AJAX",
  "PICKERING",
  "BARRIE",
  "MILTON",
  "MONTREAL",
  "VANCOUVER",
  "CALGARY",
  "EDMONTON",
  "WINNIPEG",
  "HALIFAX",
  "QUEBEC",
  "VICTORIA",
  "WINDSOR",
  "KINGSTON",
];
const CITY_END = new RegExp(`\\s+(${CITIES.join("|")})$`);
const PROV_END = new RegExp(`\\s+(${PROVINCES})$`);
const COUNTRY = /\s+(CAN|CA|USA|US)$/;

export function normalizeMerchant(raw: string): string {
  let s = raw
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(PREFIXES, "");
  s = s
    .replace(/#\s*\d+/g, " ") // store numbers
    .replace(/\b\d{3,}\b/g, " ") // long digit runs (store ids, refs, phone)
    .replace(/\*+/g, " ")
    .replace(/[^A-Z0-9&' .+/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(COUNTRY, "");
  if (PROV_END.test(s)) {
    s = s.replace(PROV_END, "");
    // "... <CITY> ON": drop a known (possibly two-word) city, otherwise exactly one word
    if (CITY_END.test(s)) s = s.replace(CITY_END, "");
    else if (s.split(" ").length > 2) s = s.replace(/\s+\S+$/, "");
  } else if (s.split(" ").length > 1) {
    s = s.replace(CITY_END, "");
  }
  s = s.replace(/[ .\/-]+$/g, "").trim();
  return s || raw.toUpperCase().trim().slice(0, 60);
}

/** Display-friendly merchant: "STARBUCKS COFFEE" -> "Starbucks Coffee"; short tokens (TD, A&W) stay upper. */
export function prettyMerchant(norm: string): string {
  return norm
    .split(" ")
    .map((w) =>
      w.length <= 3 && (/[^A-Z]/.test(w) || !/[AEIOUY]/.test(w))
        ? w
        : w.charAt(0) + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. Feb 30
  return dt.toISOString().slice(0, 10);
}

export type DateOrder = "YMD" | "MDY" | "DMY";

/**
 * Parse common Canadian bank date formats into YYYY-MM-DD.
 * Numeric slash dates are ambiguous; pass the institution's known order (default MDY).
 */
export function parseDate(input: string, order: DateOrder = "MDY"): string | null {
  const s = input.trim().replace(/^"|"$/g, "");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return order === "DMY" ? iso(y, +m[2]!, +m[1]!) : iso(y, +m[1]!, +m[2]!);
  }
  // "Oct 3, 2026" / "October 03 2026"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon =
      MONTHS[m[1]!.slice(0, m[1]!.toUpperCase().startsWith("SEPT") ? 4 : 3).toUpperCase()];
    return mon ? iso(+m[3]!, mon, +m[2]!) : null;
  }
  // "03-Oct-2026" / "3 Oct 2026"
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[2]!.slice(0, 3).toUpperCase()];
    return mon ? iso(+m[3]!, mon, +m[1]!) : null;
  }
  return null;
}

export function monthFromAbbrev(abbrev: string): number | undefined {
  return MONTHS[abbrev.slice(0, 3).toUpperCase()];
}

/**
 * Parse an amount cell into cents. Handles "$1,234.56", "-12.30", "(45.00)", "12.30 CR", "1 234,56"
 * is NOT supported (Canadian English exports use dot decimals). Returns null for empty cells.
 */
export function parseAmount(input: string | undefined | null): number | null {
  if (input === undefined || input === null) return null;
  let s = String(input).trim().replace(/^"|"$/g, "");
  if (s === "" || s === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s*CR$/i.test(s)) {
    negative = true;
    s = s.replace(/\s*CR$/i, "");
  }
  if (/^-|-$/.test(s.replace(/[$\s]/g, ""))) negative = !negative;
  const digits = s.replace(/[^0-9.]/g, "");
  if (!/^\d*\.?\d*$/.test(digits) || digits === "" || digits === ".") return null;
  const [whole = "0", frac = ""] = digits.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function last4(s: string | undefined | null): string | undefined {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : undefined;
}
