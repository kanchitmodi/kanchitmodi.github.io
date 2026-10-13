const fmt = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const fmtWhole = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function formatCents(
  cents: number,
  opts: { whole?: boolean; currency?: string } = {},
): string {
  const value = cents / 100;
  if (opts.currency && opts.currency !== "CAD") {
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: opts.currency }).format(
      value,
    );
  }
  return (opts.whole ? fmtWhole : fmt).format(value);
}

/** Parse "1,234.56" / "-$12.30" / "(45.00)" into integer cents. */
export function parseToCents(input: string): number {
  const s = input.trim();
  const negative = /^\(.*\)$/.test(s) || s.includes("-");
  const digits = s.replace(/[^0-9.]/g, "");
  if (!digits) throw new Error(`Not a money amount: ${input}`);
  const [whole = "0", frac = ""] = digits.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}
