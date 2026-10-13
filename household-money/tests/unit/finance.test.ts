import { describe, expect, it } from "vitest";
import { cashFlow, monthBounds, netWorth, spendByCategory, todayInToronto } from "@/lib/finance";
import { formatCents, parseToCents } from "@/lib/money";
import { accountDedupeKey, accountStatus } from "@/lib/account-status";

describe("netWorth", () => {
  const hh = { ownerUserId: "k", jointSplitPct: 50 };
  const accounts = [
    { ownerType: "INDIVIDUAL" as const, ownerUserId: "k", balanceCents: 100_000 },
    { ownerType: "INDIVIDUAL" as const, ownerUserId: "k", balanceCents: -20_000 },
    { ownerType: "INDIVIDUAL" as const, ownerUserId: "w", balanceCents: 50_000 },
    { ownerType: "JOINT" as const, ownerUserId: null, balanceCents: 30_001 },
  ];
  it("household totals everything", () => {
    expect(netWorth(accounts, { kind: "household" }, hh)).toEqual({
      assetsCents: 180_001,
      liabilitiesCents: 20_000,
      netCents: 160_001,
    });
  });
  it("person view splits joint 50/50", () => {
    expect(netWorth(accounts, { kind: "person", userId: "k" }, hh).netCents).toBe(
      100_000 - 20_000 + 15_001,
    );
    expect(netWorth(accounts, { kind: "person", userId: "w" }, hh).netCents).toBe(50_000 + 15_000);
    expect(
      netWorth(accounts, { kind: "person", userId: "k" }, hh).netCents +
        netWorth(accounts, { kind: "person", userId: "w" }, hh).netCents,
    ).toBe(160_001);
  });
});

describe("cashFlow / savings rate", () => {
  const t = (
    date: string,
    amountCents: number,
    categoryKind: "EXPENSE" | "INCOME" | "TRANSFER",
    isTransfer = false,
    categoryName = "X",
  ) => ({
    date,
    amountCents,
    categoryKind,
    isTransfer,
    categoryName,
  });
  const txns = [
    t("2026-09-15", 500_000, "INCOME"),
    t("2026-09-03", -10_000, "EXPENSE", false, "Groceries"),
    t("2026-09-04", 2_000, "EXPENSE", false, "Groceries"), // refund
    t("2026-09-05", -100_000, "TRANSFER", true), // card payment: never spend
    t("2026-08-31", -99_999, "EXPENSE"), // outside month
  ];
  it("excludes transfers and nets refunds", () => {
    expect(cashFlow(txns, "2026-09-01", "2026-09-30")).toEqual({
      incomeCents: 500_000,
      spendCents: 8_000,
      savingsRateBp: 9_840,
    });
  });
  it("savings rate is null with no income", () => {
    expect(
      cashFlow([t("2026-09-03", -1, "EXPENSE")], "2026-09-01", "2026-09-30").savingsRateBp,
    ).toBeNull();
  });
  it("groups by category", () => {
    expect(spendByCategory(txns, "2026-09-01", "2026-09-30")).toEqual({ Groceries: 8_000 });
  });
});

describe("dates & money", () => {
  it("month bounds handle leap years", () => {
    expect(monthBounds("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthBounds("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("today is Toronto time, not UTC", () => {
    expect(todayInToronto(new Date("2026-10-14T02:00:00Z"))).toBe("2026-10-13");
  });
  it("formats and parses CAD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(parseToCents("1,234.56")).toBe(123456);
    expect(parseToCents("-$12.3")).toBe(-1230);
    expect(parseToCents("(45.00)")).toBe(-4500);
    expect(() => parseToCents("abc")).toThrow();
  });
});

describe("account status & dedupe", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
  it("labels by connection mode and staleness", () => {
    expect(
      accountStatus({ connectionMode: "LIVE", syncTier: "ACTIVE", lastSyncedAt: hoursAgo(1) }, now),
    ).toBe("Live");
    expect(
      accountStatus(
        { connectionMode: "EMAIL", syncTier: "ACTIVE", lastSyncedAt: hoursAgo(1) },
        now,
      ),
    ).toBe("Email");
    expect(
      accountStatus(
        { connectionMode: "LIVE", syncTier: "ACTIVE", lastSyncedAt: hoursAgo(73) },
        now,
      ),
    ).toBe("Stale");
    expect(
      accountStatus({ connectionMode: "LIVE", syncTier: "LOW", lastSyncedAt: hoursAgo(73) }, now),
    ).toBe("Live");
    expect(
      accountStatus({ connectionMode: "MANUAL", syncTier: "LOW", lastSyncedAt: null }, now),
    ).toBe("Manual");
  });
  it("dedupes joint accounts seen via two logins by institution + mask", () => {
    expect(accountDedupeKey({ institution: "TD ", mask: "5555", type: "CHEQUING" })).toBe(
      accountDedupeKey({ institution: "td", mask: "5555", type: "CHEQUING" }),
    );
    expect(accountDedupeKey({ institution: "TD", mask: "5555", type: "CHEQUING" })).not.toBe(
      accountDedupeKey({ institution: "TD", mask: "5556", type: "CHEQUING" }),
    );
  });
});
