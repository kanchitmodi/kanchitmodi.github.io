import { describe, expect, it } from "vitest";
import {
  CONNECTIONS,
  PLAID_ITEM_LIMIT,
  plaidItemUsage,
  wouldExceedPlaidBudget,
} from "@config/connections";
import { SETUP_STEPS } from "@config/setup-steps";

describe("connection plan", () => {
  it("uses 5 of 10 Plaid Items with 2 reserved (spec target)", () => {
    const u = plaidItemUsage();
    expect(u).toMatchObject({
      used: 5,
      limit: PLAID_ITEM_LIMIT,
      reserve: 2,
      available: 3,
      byPerson: { kanchit: 3, wife: 2 },
    });
  });
  it("warns before eating into the reserve", () => {
    const u = plaidItemUsage();
    expect(wouldExceedPlaidBudget(u, 3)).toBe(false);
    expect(wouldExceedPlaidBudget(u, 4)).toBe(true);
  });
  it("lists every joint account exactly once", () => {
    const joint = CONNECTIONS.flatMap((c) => c.accounts).filter((a) => a.owner === "joint");
    expect(joint.map((a) => a.key).sort()).toEqual(["td-chequing-joint", "ws-cash-joint"]);
  });
  it("has unique keys", () => {
    const keys = CONNECTIONS.flatMap((c) => [c.key, ...c.accounts.map((a) => a.key)]);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("marks Wealthsimple and PC Financial as known-flaky", () => {
    expect(
      CONNECTIONS.filter((c) => c.flaky)
        .map((c) => c.institution)
        .sort(),
    ).toEqual(["PC Financial", "Wealthsimple"]);
  });
  it("covers 6 brokerage logins via SnapTrade", () => {
    expect(CONNECTIONS.filter((c) => c.provider === "snaptrade")).toHaveLength(6);
  });
});

describe("setup steps", () => {
  it("numbers steps 0..11 with unique keys", () => {
    expect(SETUP_STEPS.map((s) => s.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(SETUP_STEPS.map((s) => s.key)).size).toBe(SETUP_STEPS.length);
  });
  it("only links to https or in-app pages", () => {
    for (const s of SETUP_STEPS)
      for (const i of s.items) if (i.href) expect(i.href).toMatch(/^(https:\/\/|\/)/);
  });
  it("asks only for the gmail.readonly scope", () => {
    const gmail = SETUP_STEPS.find((s) => s.key === "gmail")!;
    const text = gmail.items.map((i) => i.label).join(" ");
    expect(text).toContain("gmail.readonly");
    expect(text).not.toMatch(/gmail\.(modify|send|compose)|mail\.google\.com\/ /);
  });
});
