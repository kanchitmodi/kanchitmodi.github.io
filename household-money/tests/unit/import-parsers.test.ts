import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseCsv, parseImportFile } from "@/lib/import/detect";
import { parseStatementText, statementEnd } from "@/lib/import/pdf";

const fx = (name: string) => readFileSync(`tests/fixtures/import/${name}`, "utf8");
const sum = (rows: { amountCents: number }[]) => rows.reduce((s, r) => s + r.amountCents, 0);

describe("CSV auto-detection + parsing (one fixture per institution)", () => {
  it("TD chequing: no header, debit/credit columns", () => {
    const r = parseCsv(fx("td-chequing.csv"));
    expect(r.format).toBe("td");
    expect(r.rows).toHaveLength(7);
    expect(r.rows[0]).toMatchObject({
      date: "2026-09-02",
      amountCents: -125000,
      description: "TFR-TO C/C",
    });
    expect(r.rows[2]).toMatchObject({ amountCents: 320000 });
    expect(sum(r.rows)).toBe(-125000 - 8642 + 320000 - 245 - 245 - 9817 - 1795);
  });

  it("TD Visa: purchases negative, payment and refund positive", () => {
    const r = parseCsv(fx("td-visa.csv"));
    expect(r.format).toBe("td");
    expect(r.rows.map((x) => x.amountCents)).toEqual([-21233, -6120, -4599, 27353, 1200]);
  });

  it("CIBC credit: ISO dates, card number -> last 4, quoted commas", () => {
    const r = parseCsv(fx("cibc-credit.csv"));
    expect(r).toMatchObject({ format: "cibc", accountType: "CREDIT_CARD", accountLast4: "7788" });
    expect(r.rows[0]).toMatchObject({
      description: "SHOPPERS DRUG MART #0882 TORONTO, ON",
      amountCents: -2347,
    });
    expect(r.rows[2]!.amountCents).toBe(5465);
    expect(r.rows[3]).toMatchObject({ description: "ANNUAL FEE", amountCents: -13900 });
  });

  it("Scotiabank current export: Type of Transaction decides the sign", () => {
    const r = parseCsv(fx("scotiabank-current.csv"));
    expect(r.format).toBe("scotiabank");
    expect(r.rows.map((x) => x.amountCents)).toEqual([-5410, 260000, -6175, -41208]);
    expect(r.rows[0]!.description).toBe("POS Purchase FARM BOY #12 TORONTO ON");
  });

  it("Scotiabank legacy export", () => {
    const r = parseCsv(fx("scotiabank-legacy.csv"));
    expect(r.format).toBe("scotiabank");
    expect(r.rows.map((x) => x.amountCents)).toEqual([-5410, 260000]);
  });

  it("Wealthsimple cash", () => {
    const r = parseCsv(fx("wealthsimple-cash.csv"));
    expect(r).toMatchObject({ format: "wealthsimple", accountType: "CHEQUING" });
    expect(r.rows).toHaveLength(5);
    expect(r.rows[1]).toMatchObject({ description: "Starbucks Toronto", amountCents: -645 });
  });

  it("Wealthsimple credit card: purchases out, payments/refunds in", () => {
    const r = parseCsv(fx("wealthsimple-credit.csv"));
    expect(r).toMatchObject({ format: "wealthsimple", accountType: "CREDIT_CARD" });
    expect(r.rows.map((x) => x.amountCents)).toEqual([-2099, -3412, 41822, 850, -399]);
    expect(r.rows[0]!.currency).toBe("CAD");
  });

  it("PC Financial: cardholder captured", () => {
    const r = parseCsv(fx("pc-financial.csv"));
    expect(r).toMatchObject({
      format: "pc-financial",
      institution: "PC Financial",
      accountType: "CREDIT_CARD",
    });
    expect(r.rows.map((x) => x.amountCents)).toEqual([-10436, -5890, 41208, -9715]);
    expect(r.rows[0]!.cardholder).toBe("WIFE MODI");
  });

  it("Rogers: skips declined, flips signs, captures card last 4 and $1,240.00", () => {
    const r = parseCsv(fx("rogers.csv"));
    expect(r).toMatchObject({ format: "rogers", accountLast4: "4422" });
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-19844, -6420, 26264, -124000]);
    expect(r.rows[0]!.description).toBe("COSTCO WHOLESALE W535 TORONTO ON");
  });

  it("Questrade: contributions/trades are transfers, dividends income, fees fees", () => {
    const r = parseCsv(fx("questrade.csv"));
    expect(r).toMatchObject({
      format: "questrade",
      accountType: "INVESTMENT",
      accountLast4: "4567",
    });
    expect(r.rows.map((x) => [x.amountCents, x.categoryHint, !!x.transferHint])).toEqual([
      [100000, "Transfers", true],
      [-94500, "Transfers", true],
      [837, "Income", false],
      [-995, "Fees", false],
    ]);
    expect(r.rows[0]!.date).toBe("2026-09-02");
  });

  it("IBKR activity statement: cash sections only, totals skipped, USD kept", () => {
    const r = parseCsv(fx("ibkr-activity.csv"));
    expect(r).toMatchObject({ format: "ibkr", accountLast4: "6543" });
    expect(r.rows.map((x) => [x.amountCents, x.currency, x.categoryHint])).toEqual([
      [200000, "CAD", "Transfers"],
      [2700, "USD", "Income"],
      [-405, "USD", "Fees"],
    ]);
  });

  it("falls back to header guessing for unknown banks", () => {
    const r = parseCsv(fx("generic.csv"));
    expect(r.format).toBe("generic");
    expect(r.rows.map((x) => x.amountCents)).toEqual([-1200, 300]);
    expect(r.warnings[0]).toMatch(/Unrecognized/);
  });

  it("rejects files it can't understand", () => {
    expect(() => parseCsv("hello,world\nfoo,bar\n")).toThrow(/Couldn't recognize/);
  });
});

describe("PDF statements", () => {
  const text = [
    "PC Financial World Elite Mastercard",
    "Statement period: December 10, 2025 to January 9, 2026",
    "Previous balance 412.08",
    "Dec 12 Dec 13 NO FRILLS 3412 TORONTO ON 104.36",
    "Dec 28 Dec 29 ESSO 7781 58.90",
    "Jan 03 Jan 04 PAYMENT - THANK YOU 412.08 CR",
    "Jan 05 Jan 06 REAL CDN SUPERSTORE #1077 1,097.15",
    "Total new charges 1,260.41",
  ].join("\n");

  it("infers the year across a Dec/Jan statement and flips card signs", () => {
    expect(statementEnd(text)).toEqual({ year: 2026, month: 1 });
    const r = parseStatementText(text);
    expect(r.accountType).toBe("CREDIT_CARD");
    expect(r.rows.map((x) => [x.date, x.amountCents])).toEqual([
      ["2025-12-12", -10436],
      ["2025-12-28", -5890],
      ["2026-01-03", 41208],
      ["2026-01-05", -109715],
    ]);
    expect(r.rows.every((x) => x.confidence < 1)).toBe(true);
  });

  it("parses a real PDF file end to end", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    text
      .split("\n")
      .forEach((line, i) => page.drawText(line, { x: 40, y: 740 - i * 18, size: 11, font }));
    const bytes = await doc.save();
    const r = await parseImportFile("statement.pdf", bytes);
    expect(r.format).toBe("pdf-statement");
    expect(r.rows).toHaveLength(4);
    expect(r.rows[3]!.amountCents).toBe(-109715);
  });

  it("warns when nothing is recognized", () => {
    expect(parseStatementText("hello").warnings[0]).toMatch(/No transaction lines/);
  });
});
