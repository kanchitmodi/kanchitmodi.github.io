import { describe, expect, it } from "vitest";
import {
  accountAccess,
  accountInScope,
  balanceShare,
  canChangeVisibility,
  canManageHousehold,
  canSeeTransactions,
  parseScope,
  txnInScope,
  type AccountAcl,
  type Viewer,
} from "@/lib/permissions";

const H = "h1";
const kanchit: Viewer = { userId: "k", householdId: H, role: "OWNER" };
const wife: Viewer = { userId: "w", householdId: H, role: "MEMBER" };
const outsider: Viewer = { userId: "x", householdId: "h2", role: "OWNER" };

const acct = (o: Partial<AccountAcl>): AccountAcl => ({
  householdId: H,
  ownerType: "INDIVIDUAL",
  ownerUserId: "k",
  visibility: "SHARED",
  privateMode: "BALANCE_ONLY",
  ...o,
});

describe("accountAccess", () => {
  it("shared accounts are fully visible to both", () => {
    expect(accountAccess(kanchit, acct({}))).toBe("full");
    expect(accountAccess(wife, acct({}))).toBe("full");
  });
  it("private balance-only: owner full, other sees balance only, no transactions", () => {
    const a = acct({ visibility: "PRIVATE", privateMode: "BALANCE_ONLY" });
    expect(accountAccess(kanchit, a)).toBe("full");
    expect(accountAccess(wife, a)).toBe("balance");
    expect(canSeeTransactions(wife, a)).toBe(false);
  });
  it("private hidden: invisible to the other user", () => {
    const a = acct({ visibility: "PRIVATE", privateMode: "HIDDEN", ownerUserId: "w" });
    expect(accountAccess(wife, a)).toBe("full");
    expect(accountAccess(kanchit, a)).toBe("none");
  });
  it("household OWNER role does not override a member's privacy", () => {
    expect(
      accountAccess(
        kanchit,
        acct({ ownerUserId: "w", visibility: "PRIVATE", privateMode: "HIDDEN" }),
      ),
    ).toBe("none");
  });
  it("joint accounts are always fully visible, even if flagged private", () => {
    const a = acct({
      ownerType: "JOINT",
      ownerUserId: null,
      visibility: "PRIVATE",
      privateMode: "HIDDEN",
    });
    expect(accountAccess(kanchit, a)).toBe("full");
    expect(accountAccess(wife, a)).toBe("full");
  });
  it("other households see nothing", () => {
    expect(accountAccess(outsider, acct({}))).toBe("none");
    expect(accountAccess(outsider, acct({ ownerType: "JOINT", ownerUserId: null }))).toBe("none");
  });
});

describe("who may change what", () => {
  it("only the owner of an individual account changes its visibility", () => {
    expect(canChangeVisibility(kanchit, acct({}))).toBe(true);
    expect(canChangeVisibility(wife, acct({}))).toBe(false);
    expect(canChangeVisibility(kanchit, acct({ ownerType: "JOINT", ownerUserId: null }))).toBe(
      false,
    );
  });
  it("only the household owner manages household settings", () => {
    expect(canManageHousehold(kanchit)).toBe(true);
    expect(canManageHousehold(wife)).toBe(false);
  });
});

describe("scope (Household / Kanchit / Wife switcher)", () => {
  it("parses only known member ids", () => {
    expect(parseScope("k", ["k", "w"])).toEqual({ kind: "person", userId: "k" });
    expect(parseScope("intruder", ["k", "w"])).toEqual({ kind: "household" });
    expect(parseScope(undefined, ["k"])).toEqual({ kind: "household" });
  });
  it("joint accounts belong to both people", () => {
    const joint = { ownerType: "JOINT" as const, ownerUserId: null };
    expect(accountInScope({ kind: "person", userId: "k" }, joint)).toBe(true);
    expect(accountInScope({ kind: "person", userId: "w" }, joint)).toBe(true);
    expect(
      accountInScope(
        { kind: "person", userId: "w" },
        { ownerType: "INDIVIDUAL", ownerUserId: "k" },
      ),
    ).toBe(false);
  });
  it("transactions follow the spender", () => {
    const joint = { ownerType: "JOINT" as const, ownerUserId: null };
    expect(txnInScope({ kind: "person", userId: "w" }, { spenderUserId: "w" }, joint)).toBe(true);
    expect(txnInScope({ kind: "person", userId: "k" }, { spenderUserId: "w" }, joint)).toBe(false);
    expect(txnInScope({ kind: "person", userId: "k" }, { spenderUserId: null }, joint)).toBe(true);
  });
  it("splits joint balances by the configured percentage", () => {
    const hh = { ownerUserId: "k", jointSplitPct: 60 };
    const joint = { ownerType: "JOINT" as const, ownerUserId: null };
    expect(balanceShare({ kind: "person", userId: "k" }, joint, hh)).toBeCloseTo(0.6);
    expect(balanceShare({ kind: "person", userId: "w" }, joint, hh)).toBeCloseTo(0.4);
    expect(balanceShare({ kind: "household" }, joint, hh)).toBe(1);
  });
});
