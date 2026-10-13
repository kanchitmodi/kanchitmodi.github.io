import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { signup } from "@/lib/auth-service";
import { createInvite } from "@/lib/invites";
import {
  commitImport,
  coverage,
  createPreview,
  discardImport,
  ImportError,
} from "@/lib/import/service";
import { addComment, getTransactionDetail, setSplits, updateTransaction } from "@/lib/txn-service";
import { categorizeTransactions } from "@/lib/categorize-service";
import { listTransactions, homeSummary } from "@/lib/data";
import type { Viewer } from "@/lib/permissions";
import { resetDb } from "./helpers";

const fx = (n: string) => ({
  name: n,
  bytes: new Uint8Array(readFileSync(`tests/fixtures/import/${n}`)),
});
const NO_LLM = { llm: null };

let kanchit: Viewer;
let wife: Viewer;
const acct: Record<string, string> = {};

async function mkAccount(
  owner: Viewer | null,
  householdId: string,
  name: string,
  institution: string,
  type: "CHEQUING" | "CREDIT_CARD" | "INVESTMENT",
  mask: string,
  extra: object = {},
) {
  const a = await db.account.create({
    data: {
      householdId,
      name,
      institution,
      type,
      mask,
      ownerType: owner ? "INDIVIDUAL" : "JOINT",
      ownerUserId: owner?.userId ?? null,
      connectionMode: "MANUAL",
      ...extra,
    },
  });
  return a.id;
}

beforeAll(async () => {
  await resetDb();
  const k = await signup(db, {
    email: "k@example.com",
    name: "Kanchit",
    password: "long-password-1",
  });
  kanchit = { userId: k.userId, householdId: k.householdId, role: "OWNER" };
  const inv = await createInvite(db, kanchit, "w@example.com", "http://x");
  const w = await signup(db, {
    email: "w@example.com",
    name: "Wife",
    password: "long-password-2",
    inviteToken: decodeURIComponent(inv.link.split("invite=")[1]!),
  });
  wife = { userId: w.userId, householdId: w.householdId, role: "MEMBER" };
  const H = kanchit.householdId;
  acct.tdJoint = await mkAccount(null, H, "TD Chequing (Joint)", "TD", "CHEQUING", "3301");
  acct.tdVisa = await mkAccount(kanchit, H, "TD Visa", "TD", "CREDIT_CARD", "3302");
  acct.rogers = await mkAccount(kanchit, H, "Rogers MC", "Rogers Bank", "CREDIT_CARD", "4422");
  acct.wsCash = await mkAccount(kanchit, H, "WS Cash", "Wealthsimple", "CHEQUING", "1101");
  acct.wsCard = await mkAccount(kanchit, H, "WS Credit", "Wealthsimple", "CREDIT_CARD", "1102");
  acct.pc = await mkAccount(wife, H, "PC Mastercard", "PC Financial", "CREDIT_CARD", "6601", {
    visibility: "PRIVATE",
    privateMode: "HIDDEN",
  });
  acct.questrade = await mkAccount(kanchit, H, "Questrade RRSP", "Questrade", "INVESTMENT", "4567");
});
afterAll(() => db.$disconnect());

describe("import pipeline", () => {
  it("auto-suggests the account by institution + card last 4", async () => {
    const p = await createPreview(db, kanchit, fx("rogers.csv"));
    expect(p).toMatchObject({ format: "rogers", suggestedAccountId: acct.rogers });
    expect(p.rows).toHaveLength(4);
    expect(p.rows[0]).toMatchObject({
      merchant: "Costco Wholesale W535",
      categoryGuess: "Groceries",
      status: "new",
    });
    await discardImport(db, kanchit, p.batchId);
  });

  it("commits, then re-importing the same file adds nothing", async () => {
    const p = await createPreview(db, kanchit, fx("td-visa.csv"), acct.tdVisa);
    const r1 = await commitImport(
      db,
      kanchit,
      { batchId: p.batchId, accountId: acct.tdVisa! },
      NO_LLM,
    );
    expect(r1).toMatchObject({ imported: 5, duplicates: 0 });
    const again = await createPreview(db, kanchit, fx("td-visa.csv"), acct.tdVisa);
    expect(again.rows.every((r) => r.status === "duplicate")).toBe(true);
    const r2 = await commitImport(
      db,
      kanchit,
      { batchId: again.batchId, accountId: acct.tdVisa! },
      NO_LLM,
    );
    expect(r2).toMatchObject({ imported: 0, duplicates: 5 });
    expect(await db.transaction.count({ where: { accountId: acct.tdVisa } })).toBe(5);
    // Raw parsed rows are not retained after commit
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: p.batchId } })).rows).toBeNull();
  });

  it("keeps two identical same-day coffees, honours excluded rows", async () => {
    const p = await createPreview(db, kanchit, fx("td-chequing.csv"), acct.tdJoint);
    const r = await commitImport(
      db,
      kanchit,
      { batchId: p.batchId, accountId: acct.tdJoint!, exclude: [6] },
      NO_LLM,
    );
    expect(r).toMatchObject({ imported: 6, skipped: 1 });
    expect(
      await db.transaction.count({
        where: { accountId: acct.tdJoint, merchantNorm: "TIM HORTONS" },
      }),
    ).toBe(2);
    expect(
      await db.transaction.count({
        where: { accountId: acct.tdJoint, merchantNorm: "MONTHLY ACCOUNT FEE" },
      }),
    ).toBe(0);
  });

  it("categorizes with built-in rules and marks card payments as transfers", async () => {
    const t = await db.transaction.findMany({
      where: { accountId: acct.tdVisa },
      include: { category: true },
      orderBy: { date: "asc" },
    });
    const byMerchant = Object.fromEntries(t.map((x) => [x.merchantNorm, x]));
    expect(byMerchant["COSTCO WHOLESALE W535"]!.category?.name).toBe("Groceries");
    expect(byMerchant["PETRO-CANADA"]!.category?.name).toBe("Gas");
    const pay = byMerchant["PAYMENT - THANK YOU"]!;
    expect(pay).toMatchObject({ isTransfer: true });
    expect(pay.category?.name).toBe("Transfers");
    // The joint chequing "TFR-TO C/C" is a card payment leg too
    const tfr = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.tdJoint, merchantNorm: "TFR-TO C/C" },
    });
    expect(tfr.isTransfer).toBe(true);
  });

  it("pairs both legs of an internal transfer across two imports", async () => {
    const cash = await createPreview(db, kanchit, fx("wealthsimple-cash.csv"), acct.wsCash);
    await commitImport(db, kanchit, { batchId: cash.batchId, accountId: acct.wsCash! }, NO_LLM);
    const card = await createPreview(db, kanchit, fx("wealthsimple-credit.csv"), acct.wsCard);
    const r = await commitImport(
      db,
      kanchit,
      { batchId: card.batchId, accountId: acct.wsCard! },
      NO_LLM,
    );
    expect(r.transfers).toBeGreaterThan(0);
    const out = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.wsCash, amountCents: -41822 },
    });
    const inn = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.wsCard, amountCents: 41822 },
    });
    expect(out.transferPairId).toBeTruthy();
    expect(out.transferPairId).toBe(inn.transferPairId);
  });

  it("brokerage activity: contributions/trades are transfers, dividends income, fees fees", async () => {
    const p = await createPreview(db, kanchit, fx("questrade.csv"));
    expect(p.suggestedAccountId).toBe(acct.questrade);
    await commitImport(db, kanchit, { batchId: p.batchId, accountId: acct.questrade! }, NO_LLM);
    const rows = await db.transaction.findMany({
      where: { accountId: acct.questrade },
      include: { category: true },
      orderBy: { amountCents: "asc" },
    });
    expect(rows.map((r) => [r.amountCents, r.category?.name, r.isTransfer])).toEqual([
      [-94500, "Transfers", true],
      [-995, "Fees", false],
      [837, "Income", false],
      [100000, "Transfers", true],
    ]);
  });

  it("each person imports only into their own or joint accounts", async () => {
    await expect(createPreview(db, wife, fx("td-visa.csv"), acct.tdVisa)).rejects.toBeInstanceOf(
      ImportError,
    );
    const p = await createPreview(db, wife, fx("pc-financial.csv"));
    expect(p.suggestedAccountId).toBe(acct.pc);
    await expect(
      commitImport(db, wife, { batchId: p.batchId, accountId: acct.tdVisa! }, NO_LLM),
    ).rejects.toMatchObject({ code: "forbidden" });
    // Another member can't commit or discard your preview
    await expect(
      commitImport(db, kanchit, { batchId: p.batchId, accountId: acct.tdJoint! }, NO_LLM),
    ).rejects.toMatchObject({ code: "not_found" });
    await commitImport(db, wife, { batchId: p.batchId, accountId: acct.pc! }, NO_LLM);
    expect(await db.transaction.count({ where: { accountId: acct.pc } })).toBe(4);
  });

  it("imported private transactions stay invisible to the other member", async () => {
    const seen = await listTransactions(kanchit, { kind: "household" }, { limit: 500 });
    expect(seen.some((t) => t.account.id === acct.pc)).toBe(false);
    expect(seen.some((t) => t.merchant.includes("Frills"))).toBe(false);
  });

  it("reports 12-month backfill coverage per account", async () => {
    const c = await coverage(db, kanchit, "2026-10-13");
    expect(c.months).toHaveLength(12);
    expect(c.months.at(-1)).toBe("2026-10");
    const visa = c.accounts.find((a) => a.id === acct.tdVisa)!;
    expect(visa.monthsCovered).toBe(1);
    expect(c.accounts.some((a) => a.id === acct.pc)).toBe(false);
  });
});

describe("LLM fallback during categorization", () => {
  beforeEach(async () => {
    await db.merchantCategoryCache.deleteMany();
    await db.aiUsage.deleteMany();
  });

  it("asks Claude once per unknown merchant, caches, records cost, flags low confidence", async () => {
    const t1 = await db.transaction.create({
      data: {
        householdId: kanchit.householdId,
        accountId: acct.tdVisa!,
        date: new Date("2026-09-20"),
        amountCents: -4200,
        merchantRaw: "ZZYZX HOLDINGS",
        merchant: "Zzyzx Holdings",
        merchantNorm: "ZZYZX HOLDINGS",
        source: "CSV",
      },
    });
    const t2 = await db.transaction.create({
      data: {
        householdId: kanchit.householdId,
        accountId: acct.tdVisa!,
        date: new Date("2026-09-21"),
        amountCents: -900,
        merchantRaw: "BAKERY ABC",
        merchant: "Bakery Abc",
        merchantNorm: "BAKERY ABC",
        source: "CSV",
      },
    });
    const parse = vi.fn(async () => ({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 500, output_tokens: 100 },
      parsed_output: {
        results: [
          { merchant: "ZZYZX HOLDINGS", category: "Shopping", confidence: 0.5 },
          { merchant: "BAKERY ABC", category: "Groceries", confidence: 0.9 },
        ],
      },
    }));
    const llm = { beta: { messages: { parse } } } as never;
    const r = await categorizeTransactions(
      db,
      kanchit.householdId,
      { id: { in: [t1.id, t2.id] } },
      { llm },
    );
    expect(r).toMatchObject({ llm: 2, review: 1 });
    const a = await db.transaction.findUniqueOrThrow({
      where: { id: t1.id },
      include: { category: true },
    });
    expect(a).toMatchObject({ categorySource: "LLM", needsReview: true });
    expect(a.category?.name).toBe("Shopping");
    expect((await db.aiUsage.findFirstOrThrow()).costMicros).toBe(500 * 4 + 100 * 20);
    // Second run hits the cache — no API call
    await db.transaction.update({
      where: { id: t2.id },
      data: { categorySource: "NONE", categoryId: null },
    });
    await categorizeTransactions(db, kanchit.householdId, { id: t2.id }, { llm });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("stops calling Claude once the monthly cap is reached", async () => {
    await db.aiUsage.create({
      data: {
        householdId: kanchit.householdId,
        feature: "test",
        model: "claude-opus-5-5",
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 10_000_000,
      },
    });
    const t = await db.transaction.create({
      data: {
        householdId: kanchit.householdId,
        accountId: acct.tdVisa!,
        date: new Date("2026-09-22"),
        amountCents: -100,
        merchantRaw: "QQQ MYSTERY",
        merchant: "Qqq Mystery",
        merchantNorm: "QQQ MYSTERY",
        source: "CSV",
      },
    });
    const parse = vi.fn();
    await categorizeTransactions(
      db,
      kanchit.householdId,
      { id: t.id },
      { llm: { beta: { messages: { parse } } } as never },
    );
    expect(parse).not.toHaveBeenCalled();
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).needsReview).toBe(
      true,
    );
  });
});

describe("editing transactions", () => {
  it("a correction becomes a rule and re-categorizes matching transactions", async () => {
    const amzn = await db.transaction.findMany({
      where: { accountId: acct.tdVisa, merchantNorm: "AMZN MKTP CA 2K4L19" },
    });
    expect(amzn).toHaveLength(2);
    const kids = await db.category.findFirstOrThrow({
      where: { householdId: kanchit.householdId, name: "Kids" },
    });
    const r = await updateTransaction(db, kanchit, amzn[0]!.id, {
      categoryId: kids.id,
      applyToMerchant: true,
    });
    expect(r.learned?.updated).toBe(1);
    const after = await db.transaction.findMany({ where: { id: { in: amzn.map((a) => a.id) } } });
    expect(after.every((a) => a.categoryId === kids.id)).toBe(true);
    expect(after.find((a) => a.id === amzn[0]!.id)!.categorySource).toBe("USER");
    // Future imports use the rule
    const rule = await db.categoryRule.findFirstOrThrow({
      where: { pattern: "AMZN MKTP CA 2K4L19" },
    });
    expect(rule).toMatchObject({ isPrivate: false, createdById: kanchit.userId });
  });

  it("rules learned on a private account are private to their creator", async () => {
    const t = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.pc, merchantNorm: "ESSO" },
    });
    const gifts = await db.category.findFirstOrThrow({
      where: { householdId: wife.householdId, name: "Gifts" },
    });
    await updateTransaction(db, wife, t.id, { categoryId: gifts.id, applyToMerchant: true });
    const rule = await db.categoryRule.findFirstOrThrow({
      where: { pattern: "ESSO", createdById: wife.userId },
    });
    expect(rule.isPrivate).toBe(true);
    // Kanchit's own ESSO purchase is NOT affected by Wife's private rule
    const k = await db.transaction.create({
      data: {
        householdId: kanchit.householdId,
        accountId: acct.tdVisa!,
        date: new Date("2026-09-25"),
        amountCents: -5000,
        merchantRaw: "ESSO",
        merchant: "Esso",
        merchantNorm: "ESSO",
        source: "CSV",
      },
    });
    await categorizeTransactions(db, kanchit.householdId, { id: k.id }, NO_LLM);
    const kk = await db.transaction.findUniqueOrThrow({
      where: { id: k.id },
      include: { category: true },
    });
    expect(kk.category?.name).toBe("Gas");
  });

  it("the other member can't read or edit a private transaction (404)", async () => {
    const t = await db.transaction.findFirstOrThrow({ where: { accountId: acct.pc } });
    await expect(getTransactionDetail(db, kanchit, t.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(updateTransaction(db, kanchit, t.id, { notes: "x" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(addComment(db, kanchit, t.id, "hi")).rejects.toMatchObject({ code: "not_found" });
  });

  it("notes, comments and splits are logged with the user's name", async () => {
    const t = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.tdJoint, merchantNorm: "LOBLAWS" },
    });
    await updateTransaction(db, wife, t.id, { notes: "Party supplies" });
    await addComment(db, kanchit, t.id, "Half was for the BBQ");
    const [groc, gifts] = await Promise.all([
      db.category.findFirstOrThrow({ where: { householdId: wife.householdId, name: "Groceries" } }),
      db.category.findFirstOrThrow({ where: { householdId: wife.householdId, name: "Gifts" } }),
    ]);
    await expect(
      setSplits(db, wife, t.id, [
        { categoryId: groc.id, amountCents: -5000 },
        { categoryId: gifts.id, amountCents: -3000 },
      ]),
    ).rejects.toMatchObject({ code: "invalid" });
    await setSplits(db, wife, t.id, [
      { categoryId: groc.id, amountCents: -5000 },
      { categoryId: gifts.id, amountCents: -3642 },
    ]);
    const d = await getTransactionDetail(db, kanchit, t.id);
    expect(d.notes).toBe("Party supplies");
    expect(d.comments[0]).toMatchObject({
      body: "Half was for the BBQ",
      user: { name: "Kanchit" },
    });
    expect(d.splits.map((s) => s.amountCents)).toEqual([-5000, -3642]);
    expect(d.history.map((h) => [h.field, h.by])).toEqual(
      expect.arrayContaining([
        ["notes", "Wife"],
        ["splits", "Wife"],
      ]),
    );
  });

  it("splits flow into category totals", async () => {
    const joint = await listTransactions(
      kanchit,
      { kind: "household" },
      { accountId: acct.tdJoint, q: "loblaws" },
    );
    expect(joint[0]!.splits).toHaveLength(2);
    const s = await homeSummary(kanchit, { kind: "household" });
    expect(typeof s.month.spendCents).toBe("number");
  });

  it("un-marking a transfer re-categorizes it", async () => {
    const t = await db.transaction.findFirstOrThrow({
      where: { accountId: acct.tdVisa, merchantNorm: "PAYMENT - THANK YOU" },
    });
    await updateTransaction(db, kanchit, t.id, { isTransfer: false });
    const after = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.isTransfer).toBe(false);
    expect(after.transferPairId).toBeNull();
    await updateTransaction(db, kanchit, t.id, { isTransfer: true });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).isTransfer).toBe(true);
  });
});
