import { describe, expect, it } from "vitest";
import { normalizeMerchant, parseAmount, parseDate, prettyMerchant } from "@/lib/import/normalize";
import { dedupeKey, planImport } from "@/lib/import/dedupe";

describe("normalizeMerchant", () => {
  it.each([
    ["SQ *STARBUCKS #1234 TORONTO ON", "STARBUCKS"],
    ["LOBLAWS #1234 TORONTO ON", "LOBLAWS"],
    ["TIM HORTONS #2231", "TIM HORTONS"],
    ["COSTCO WHOLESALE W535 TORONTO ON", "COSTCO WHOLESALE W535"],
    ["Starbucks Toronto", "STARBUCKS"],
    ["SHOPPERS DRUG MART TORONTO ON", "SHOPPERS DRUG MART"],
    ["THE KEG STEAKHOUSE RICHMOND HILL ON", "THE KEG STEAKHOUSE"],
    ["FARM BOY KANATA ON", "FARM BOY"],
    ["ROGERS", "ROGERS"],
    ["APPLE.COM/BILL", "APPLE.COM/BILL"],
    ["PETRO-CANADA 98231", "PETRO-CANADA"],
    ["AMZN Mktp CA*2K4L19", "AMZN MKTP CA 2K4L19"],
    ["Café Dépôt", "CAFE DEPOT"],
    ["TST* PAI NORTHERN THAI", "PAI NORTHERN THAI"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });
  it("makes alerts and statements agree", () => {
    expect(normalizeMerchant("SHOPPERS DRUG MART #0882 TORONTO, ON")).toBe(
      normalizeMerchant("Shoppers Drug Mart #882"),
    );
  });
  it("pretty-prints", () => expect(prettyMerchant("TIM HORTONS A&W")).toBe("Tim Hortons A&W"));
});

describe("parseDate / parseAmount", () => {
  it.each([
    ["2026-09-03", "MDY", "2026-09-03"],
    ["09/03/2026", "MDY", "2026-09-03"],
    ["03/09/2026", "DMY", "2026-09-03"],
    ["9/3/26", "MDY", "2026-09-03"],
    ["Sep 3, 2026", "MDY", "2026-09-03"],
    ["Sept 3 2026", "MDY", "2026-09-03"],
    ["03-Sep-2026", "MDY", "2026-09-03"],
    ["20260903", "MDY", "2026-09-03"],
    ["2026-09-02 12:00:00 AM", "MDY", "2026-09-02"],
    ["02/30/2026", "MDY", null],
    ["nonsense", "MDY", null],
  ] as const)("%s (%s)", (raw, order, expected) => expect(parseDate(raw, order)).toBe(expected));

  it.each([
    ["$1,240.00", 124000],
    ["-$262.64", -26264],
    ["(45.00)", -4500],
    ["412.08 CR", -41208],
    ["12.30-", -1230],
    ["2000", 200000],
    ["0.5", 50],
    ["", null],
    ["-", null],
    ["abc", null],
  ] as const)("%s -> %s", (raw, cents) => expect(parseAmount(raw)).toBe(cents));
});

describe("planImport (dedupe on account+date+amount+merchant)", () => {
  const rows = [
    { date: "2026-09-05", amountCents: -245, description: "TIM HORTONS #2231" },
    { date: "2026-09-05", amountCents: -245, description: "TIM HORTONS #2231" },
    { date: "2026-09-06", amountCents: -6120, description: "PETRO-CANADA 98231" },
  ];

  it("keeps legitimate same-day duplicates within a file", () => {
    const p = planImport("acc1", rows, new Map());
    expect(p.map((x) => x.duplicate)).toEqual([false, false, false]);
    expect(new Set(p.map((x) => x.externalId)).size).toBe(3);
  });

  it("re-importing is idempotent: same external ids, all duplicates", () => {
    const first = planImport("acc1", rows, new Map());
    const counts = new Map<string, number>();
    for (const r of first) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
    const again = planImport("acc1", rows, counts);
    expect(again.map((x) => x.duplicate)).toEqual([true, true, true]);
    expect(again.map((x) => x.externalId)).toEqual(first.map((x) => x.externalId));
  });

  it("counts existing rows from any source (multiset)", () => {
    const existing = new Map([[dedupeKey("acc1", "2026-09-05", -245, "TIM HORTONS"), 1]]);
    expect(planImport("acc1", rows, existing).map((x) => x.duplicate)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("is per account", () => {
    const existing = new Map([[dedupeKey("acc2", "2026-09-06", -6120, "PETRO-CANADA"), 1]]);
    expect(planImport("acc1", rows, existing)[2]!.duplicate).toBe(false);
  });
});
