/**
 * Permission tests: Private account data is never visible to the other user through the data
 * layer that every API route, page, report and AI prompt uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { seedDemoHousehold } from "@/lib/demo/seed";
import { homeSummary, listAccounts, listTransactions } from "@/lib/data";
import type { Viewer } from "@/lib/permissions";
import { resetDb } from "./helpers";

let kanchit: Viewer;
let wife: Viewer;
let cibcId: string; // Kanchit's PRIVATE / HIDDEN
let pcId: string; // Wife's PRIVATE / BALANCE_ONLY

beforeAll(async () => {
  await resetDb();
  const r = await seedDemoHousehold(db, { endDate: "2026-09-30" });
  kanchit = { userId: r.users.kanchit.id, householdId: r.householdId, role: "OWNER" };
  wife = { userId: r.users.wife.id, householdId: r.householdId, role: "MEMBER" };
  cibcId = (await db.account.findFirstOrThrow({ where: { configKey: "cibc-credit-kanchit" } })).id;
  pcId = (await db.account.findFirstOrThrow({ where: { configKey: "pc-mc-wife" } })).id;
});
afterAll(() => db.$disconnect());

const HH = { kind: "household" } as const;

describe("accounts", () => {
  it("owner sees all their own accounts including private ones", async () => {
    const ids = (await listAccounts(kanchit, HH)).map((a) => a.id);
    expect(ids).toContain(cibcId);
  });

  it("HIDDEN private account does not exist for the other user", async () => {
    const accounts = await listAccounts(wife, HH);
    expect(accounts.map((a) => a.id)).not.toContain(cibcId);
    expect(accounts.map((a) => a.name)).not.toContain("CIBC Credit Card");
    expect(await listAccounts(wife, { kind: "person", userId: kanchit.userId })).not.toContainEqual(
      expect.objectContaining({ id: cibcId }),
    );
  });

  it("BALANCE_ONLY private account shows balance but nothing identifying", async () => {
    const pc = (await listAccounts(kanchit, HH)).find((a) => a.id === pcId)!;
    expect(pc).toMatchObject({
      access: "balance",
      name: "Private account",
      institution: null,
      mask: null,
      status: null,
      privateMode: null,
    });
    expect(typeof pc.balanceCents).toBe("number");
  });

  it("joint accounts appear exactly once", async () => {
    const joint = (await listAccounts(kanchit, HH)).filter((a) => a.ownerType === "JOINT");
    expect(joint.map((a) => a.name).sort()).toEqual([
      "TD Chequing (Joint)",
      "Wealthsimple Joint Cash",
    ]);
    // DB uniqueness on (household, institution, mask, type) prevents a second copy via another login.
    const td = await db.account.findFirstOrThrow({ where: { configKey: "td-chequing-joint" } });
    await expect(
      db.account.create({
        data: {
          householdId: td.householdId,
          name: "TD dup",
          institution: td.institution,
          mask: td.mask,
          type: td.type,
          ownerType: "JOINT",
        },
      }),
    ).rejects.toThrow();
  });

  it("privateMode is only revealed to the owner", async () => {
    const own = (await listAccounts(wife, HH)).find((a) => a.id === pcId)!;
    expect(own.privateMode).toBe("BALANCE_ONLY");
  });
});

describe("transactions", () => {
  it("never returns transactions from the other user's private accounts", async () => {
    const wifeSees = await listTransactions(wife, HH, {
      limit: 500,
      from: "2025-10-01",
      to: "2026-09-30",
    });
    expect(wifeSees.length).toBeGreaterThan(0);
    expect(wifeSees.some((t) => t.account.id === cibcId)).toBe(false);
    expect(wifeSees.some((t) => t.merchant === "Air Canada")).toBe(false);

    const kanchitSees = await listTransactions(kanchit, HH, {
      limit: 500,
      from: "2025-10-01",
      to: "2026-09-30",
    });
    expect(kanchitSees.some((t) => t.account.id === pcId)).toBe(false);
  });

  it("explicitly requesting a private account's transactions returns nothing", async () => {
    expect(await listTransactions(wife, HH, { accountId: cibcId })).toEqual([]);
    expect(await listTransactions(kanchit, HH, { accountId: pcId })).toEqual([]);
  });

  it("owners still see their own private transactions", async () => {
    expect((await listTransactions(kanchit, HH, { accountId: cibcId })).length).toBeGreaterThan(0);
  });

  it("search can't be used to probe private merchants", async () => {
    expect(await listTransactions(wife, HH, { q: "Air Canada" })).toEqual([]);
  });

  it("person scope only includes that person's spending", async () => {
    const w = await listTransactions(
      kanchit,
      { kind: "person", userId: wife.userId },
      { limit: 500 },
    );
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((t) => t.spender?.id === wife.userId)).toBe(true);
  });

  it("each transaction shows whose card it was", async () => {
    const t = await listTransactions(kanchit, HH, { limit: 50 });
    expect(t.every((x) => x.spender !== null && ["Kanchit", "Wife"].includes(x.spender.name))).toBe(
      true,
    );
  });
});

describe("summaries respect privacy", () => {
  it("hidden balances are excluded from the other user's household net worth", async () => {
    const cibc = await db.account.findUniqueOrThrow({ where: { id: cibcId } });
    const k = await homeSummary(kanchit, HH);
    const w = await homeSummary(wife, HH);
    expect(k.netWorth.netCents - w.netWorth.netCents).toBe(cibc.balanceCents);
  });

  it("other households can see nothing", async () => {
    const outsider: Viewer = { userId: "nobody", householdId: "other-household", role: "OWNER" };
    expect(await listAccounts(outsider, HH)).toEqual([]);
    expect(await listTransactions(outsider, HH)).toEqual([]);
  });
});
