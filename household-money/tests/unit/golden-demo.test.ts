/**
 * Golden dataset: the fixed demo data must produce these exact totals. If a change to the
 * generator or the money math moves any of them, CI fails — update deliberately, never casually.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, generateDemo } from "@/lib/demo/generator";
import { cashFlow, netWorth, spendByCategory } from "@/lib/finance";

const demo = generateDemo({ endDate: "2026-09-30" });
const kind = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c.kind]));
const flows = demo.txns.map((t) => ({
  date: t.date,
  amountCents: t.amountCents,
  isTransfer: t.isTransfer,
  categoryKind: kind.get(t.category) ?? null,
  categoryName: t.category,
}));

describe("golden demo dataset (anchor 2026-09-30)", () => {
  it("is deterministic", () => {
    expect(generateDemo({ endDate: "2026-09-30" })).toEqual(demo);
    expect(generateDemo({ endDate: "2026-09-30", seed: 7 }).txns).not.toEqual(demo.txns);
  });

  it("has the expected shape", () => {
    expect(demo.txns).toHaveLength(700);
    expect(demo.accounts).toHaveLength(16);
    expect(demo.txns[0]!.date).toBe("2025-10-01");
    expect(demo.txns.at(-1)!.date).toBe("2026-09-30");
    expect(new Set(demo.txns.map((t) => t.externalId)).size).toBe(700);
  });

  it("September 2026 totals", () => {
    expect(cashFlow(flows, "2026-09-01", "2026-09-30")).toEqual({
      incomeCents: 1_160_000,
      spendCents: 480_516,
      savingsRateBp: 5_858,
    });
    expect(spendByCategory(flows, "2026-09-01", "2026-09-30")).toEqual({
      "Rent/Mortgage": 245_000,
      Fees: 2_400,
      Groceries: 90_325,
      Dining: 49_690,
      Gas: 19_315,
      Utilities: 34_712,
      Health: 5_849,
      Subscriptions: 5_196,
      Shopping: 28_029,
    });
  });

  it("12-month totals", () => {
    expect(cashFlow(flows, "2025-10-01", "2026-09-30")).toEqual({
      incomeCents: 13_920_000,
      spendCents: 5_910_274,
      savingsRateBp: 5_754,
    });
  });

  it("household net worth", () => {
    const accounts = demo.accounts.map((a) => ({
      ownerType: a.owner === "joint" ? ("JOINT" as const) : ("INDIVIDUAL" as const),
      ownerUserId: a.owner === "joint" ? null : a.owner,
      balanceCents: demo.balances[a.key]!,
    }));
    const hh = { ownerUserId: "kanchit", jointSplitPct: 50 };
    expect(netWorth(accounts, { kind: "household" }, hh)).toEqual({
      assetsCents: 31_266_630,
      liabilitiesCents: 206_904,
      netCents: 31_059_726,
    });
    const k = netWorth(accounts, { kind: "person", userId: "kanchit" }, hh).netCents;
    const w = netWorth(accounts, { kind: "person", userId: "wife" }, hh).netCents;
    expect(k + w).toBe(31_059_726);
  });

  it("every card payment has a matching outflow (no double counting)", () => {
    const payments = demo.txns.filter((t) => t.isTransfer && t.merchant.startsWith("Payment"));
    const inflows = payments.filter((t) => t.amountCents > 0);
    const outflows = payments.filter((t) => t.amountCents < 0);
    expect(inflows.length).toBe(outflows.length);
    for (const p of inflows) {
      expect(outflows.some((o) => o.date === p.date && o.amountCents === -p.amountCents)).toBe(
        true,
      );
    }
    expect(demo.txns.filter((t) => t.isTransfer).every((t) => t.category === "Transfers")).toBe(
      true,
    );
  });

  it("Costco is only ever charged to a Mastercard", () => {
    const costco = demo.txns.filter((t) => t.merchant.startsWith("Costco"));
    expect(costco.length).toBeGreaterThan(0);
    expect(costco.every((t) => t.accountKey === "rogers-mc-kanchit")).toBe(true);
  });

  it("includes one private-balance-only and one private-hidden account for permission tests", () => {
    expect(
      demo.accounts.filter((a) => a.visibility === "PRIVATE").map((a) => [a.key, a.privateMode]),
    ).toEqual([
      ["cibc-credit-kanchit", "HIDDEN"],
      ["pc-mc-wife", "BALANCE_ONLY"],
    ]);
  });
});
