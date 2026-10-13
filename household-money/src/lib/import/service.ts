import { Prisma, type Account, type PrismaClient } from "@prisma/client";
import { accountAccess, type Viewer } from "../permissions";
import { categorize } from "../categorize";
import {
  loadUserRules,
  categorizeTransactions,
  type CategorizeOptions,
} from "../categorize-service";
import { runTransferDetection } from "../transfer-service";
import { dedupeKey, planImport } from "./dedupe";
import { parseImportFile } from "./detect";
import { prettyMerchant } from "./normalize";
import type { ParseResult, ParsedRow } from "./types";

export class ImportError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "bad_file" | "already_committed" | "no_rows",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Each person imports into their own accounts (and joint ones) — never into the other's. */
export function canImportInto(
  viewer: Viewer,
  a: Pick<Account, "householdId" | "ownerType" | "ownerUserId" | "visibility" | "privateMode">,
): boolean {
  return (
    accountAccess(viewer, a) === "full" &&
    (a.ownerType === "JOINT" || a.ownerUserId === viewer.userId)
  );
}

export async function importableAccounts(db: PrismaClient, viewer: Viewer): Promise<Account[]> {
  const all = await db.account.findMany({
    where: { householdId: viewer.householdId, archived: false },
    orderBy: { name: "asc" },
  });
  return all.filter((a) => canImportInto(viewer, a));
}

/** Pick the account a file most likely belongs to: institution + last 4, else the only one at that bank. */
export function suggestAccount(
  parsed: Pick<ParseResult, "institution" | "accountLast4" | "accountType">,
  accounts: Account[],
): Account | null {
  const byLast4 = parsed.accountLast4 ? accounts.filter((a) => a.mask === parsed.accountLast4) : [];
  if (byLast4.length === 1) return byLast4[0]!;
  if (!parsed.institution) return null;
  let sameBank = accounts.filter(
    (a) => a.institution.toLowerCase() === parsed.institution!.toLowerCase(),
  );
  if (parsed.accountType !== "UNKNOWN") {
    const typed = sameBank.filter((a) => a.type === parsed.accountType);
    if (typed.length) sameBank = typed;
  }
  return sameBank.length === 1 ? sameBank[0]! : null;
}

export interface PreviewRow {
  index: number;
  date: string;
  description: string;
  merchant: string;
  amountCents: number;
  status: "new" | "duplicate";
  categoryGuess: string | null;
  confidence: number;
}

async function existingCounts(
  db: PrismaClient,
  accountId: string,
  rows: ParsedRow[],
): Promise<Map<string, number>> {
  if (rows.length === 0) return new Map();
  const dates = rows.map((r) => r.date).sort();
  const existing = await db.transaction.findMany({
    where: {
      accountId,
      date: { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates.at(-1)}T00:00:00Z`) },
    },
    select: { date: true, amountCents: true, merchantNorm: true },
  });
  const counts = new Map<string, number>();
  for (const e of existing) {
    const k = dedupeKey(
      accountId,
      e.date.toISOString().slice(0, 10),
      e.amountCents,
      e.merchantNorm,
    );
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export async function buildPreview(
  db: PrismaClient,
  viewer: Viewer,
  rows: ParsedRow[],
  account: Account | null,
): Promise<PreviewRow[]> {
  if (!account) {
    return rows.map((r, index) => ({
      index,
      date: r.date,
      description: r.description,
      merchant: r.description,
      amountCents: r.amountCents,
      status: "new",
      categoryGuess: r.categoryHint ?? null,
      confidence: r.confidence,
    }));
  }
  const [counts, rules] = await Promise.all([
    existingCounts(db, account.id, rows),
    loadUserRules(db, viewer.householdId),
  ]);
  return planImport(account.id, rows, counts).map((p, index) => {
    const c = categorize(
      {
        merchantNorm: p.merchantNorm,
        amountCents: p.row.amountCents,
        isTransfer: !!p.row.transferHint,
        accountOwnerUserId: account.ownerUserId,
        categoryHint: p.row.categoryHint,
      },
      rules,
    );
    return {
      index,
      date: p.row.date,
      description: p.row.description,
      merchant: prettyMerchant(p.merchantNorm),
      amountCents: p.row.amountCents,
      status: p.duplicate ? "duplicate" : "new",
      categoryGuess: c.categoryName,
      confidence: Math.min(c.confidence, p.row.confidence),
    };
  });
}

export async function createPreview(
  db: PrismaClient,
  viewer: Viewer,
  file: { name: string; bytes: Uint8Array },
  accountId?: string,
) {
  let parsed: ParseResult;
  try {
    parsed = await parseImportFile(file.name, file.bytes);
  } catch (e) {
    throw new ImportError("bad_file", (e as Error).message);
  }
  if (parsed.rows.length === 0)
    throw new ImportError("no_rows", parsed.warnings[0] ?? "No transactions found in this file.");
  const accounts = await importableAccounts(db, viewer);
  const account = accountId
    ? (accounts.find((a) => a.id === accountId) ?? null)
    : suggestAccount(parsed, accounts);
  if (accountId && !account)
    throw new ImportError("forbidden", "You can only import into your own or joint accounts.");
  const dates = parsed.rows.map((r) => r.date).sort();
  const batch = await db.importBatch.create({
    data: {
      householdId: viewer.householdId,
      userId: viewer.userId,
      accountId: account?.id,
      format: parsed.format,
      filename: file.name.slice(0, 120),
      rows: parsed.rows as unknown as Prisma.InputJsonValue,
      rowCount: parsed.rows.length,
      dateFrom: new Date(`${dates[0]}T00:00:00Z`),
      dateTo: new Date(`${dates.at(-1)}T00:00:00Z`),
    },
  });
  return {
    batchId: batch.id,
    format: parsed.format,
    institution: parsed.institution,
    accountType: parsed.accountType,
    accountLast4: parsed.accountLast4 ?? null,
    warnings: parsed.warnings,
    suggestedAccountId: account?.id ?? null,
    rows: await buildPreview(db, viewer, parsed.rows, account),
  };
}

async function loadBatch(db: PrismaClient, viewer: Viewer, batchId: string) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  // Batches are private to the person who uploaded them.
  if (!batch || batch.householdId !== viewer.householdId || batch.userId !== viewer.userId)
    throw new ImportError("not_found");
  if (batch.status !== "PREVIEW") throw new ImportError("already_committed");
  return batch;
}

export async function previewForAccount(
  db: PrismaClient,
  viewer: Viewer,
  batchId: string,
  accountId: string,
) {
  const batch = await loadBatch(db, viewer, batchId);
  const account = (await importableAccounts(db, viewer)).find((a) => a.id === accountId);
  if (!account)
    throw new ImportError("forbidden", "You can only import into your own or joint accounts.");
  return buildPreview(db, viewer, batch.rows as unknown as ParsedRow[], account);
}

export async function commitImport(
  db: PrismaClient,
  viewer: Viewer,
  args: { batchId: string; accountId: string; exclude?: number[] },
  opts: CategorizeOptions = {},
) {
  const batch = await loadBatch(db, viewer, args.batchId);
  const account = (await importableAccounts(db, viewer)).find((a) => a.id === args.accountId);
  if (!account)
    throw new ImportError("forbidden", "You can only import into your own or joint accounts.");
  const rows = batch.rows as unknown as ParsedRow[];
  const exclude = new Set(args.exclude ?? []);
  const plan = planImport(
    account.id,
    rows,
    await existingCounts(db, account.id, rows),
    batch.format.startsWith("pdf") ? "pdf" : "csv",
  );
  const toInsert = plan.filter((p, i) => !p.duplicate && !exclude.has(i));

  // Who spent it: the account owner; for joint accounts, the importer.
  const spenderUserId = account.ownerUserId ?? viewer.userId;
  const transfersCat = await db.category.findFirst({
    where: { householdId: viewer.householdId, name: "Transfers" },
  });

  const created = await db.transaction.createMany({
    data: toInsert.map((p) => ({
      householdId: viewer.householdId,
      accountId: account.id,
      date: new Date(`${p.row.date}T00:00:00Z`),
      amountCents: p.row.amountCents,
      currency: p.row.currency || account.currency,
      merchantRaw: p.row.description.slice(0, 200),
      merchant: prettyMerchant(p.merchantNorm),
      merchantNorm: p.merchantNorm,
      spenderUserId,
      isTransfer: !!p.row.transferHint,
      categoryId: p.row.transferHint ? (transfersCat?.id ?? null) : null,
      categorySource: p.row.transferHint ? ("IMPORT" as const) : ("NONE" as const),
      source: batch.format.startsWith("pdf") ? ("PDF" as const) : ("CSV" as const),
      externalId: p.externalId,
      importBatchId: batch.id,
      categoryConfidence: p.row.transferHint ? 1 : null,
    })),
    skipDuplicates: true,
  });

  // Category hints (brokerage dividends/fees) are applied as IMPORT-sourced categories.
  const hinted = toInsert.filter((p) => p.row.categoryHint && !p.row.transferHint);
  for (const p of hinted) {
    const cat = await db.category.findFirst({
      where: { householdId: viewer.householdId, name: p.row.categoryHint! },
    });
    if (cat) {
      await db.transaction.updateMany({
        where: { accountId: account.id, externalId: p.externalId },
        data: { categoryId: cat.id, categorySource: "IMPORT", categoryConfidence: 0.95 },
      });
    }
  }

  const dates = toInsert.map((p) => p.row.date).sort();
  let transfers = 0;
  let cat = { categorized: 0, llm: 0, review: 0 };
  if (dates.length) {
    transfers = await runTransferDetection(db, viewer.householdId, dates[0]!, dates.at(-1)!);
    cat = await categorizeTransactions(
      db,
      viewer.householdId,
      { importBatchId: batch.id, categorySource: "NONE", isTransfer: false },
      opts,
    );
  }

  const duplicates = plan.filter((p) => p.duplicate).length;
  await db.importBatch.update({
    where: { id: batch.id },
    // Parsed rows are dropped once committed; only the transactions remain.
    data: {
      status: "COMMITTED",
      accountId: account.id,
      importedCount: created.count,
      duplicateCount: duplicates,
      rows: Prisma.DbNull,
      committedAt: new Date(),
    },
  });
  await db.account.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
  await db.auditLog.create({
    data: {
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "data.import",
      entityType: "account",
      entityId: account.id,
      details: { format: batch.format, imported: created.count, duplicates, skipped: exclude.size },
    },
  });
  return { imported: created.count, duplicates, skipped: exclude.size, transfers, ...cat };
}

export async function discardImport(db: PrismaClient, viewer: Viewer, batchId: string) {
  await loadBatch(db, viewer, batchId);
  await db.importBatch.update({
    where: { id: batchId },
    data: { status: "DISCARDED", rows: Prisma.DbNull },
  });
}

/** Backfill coverage: which of the last 12 months have data, per account the viewer can import into. */
export async function coverage(db: PrismaClient, viewer: Viewer, today: string) {
  const accounts = await importableAccounts(db, viewer);
  const months: string[] = [];
  const [y, m] = today.split("-").map(Number) as [number, number];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const rows = await db.$queryRaw<{ accountId: string; month: string; n: bigint }[]>`
    SELECT "accountId", to_char("date", 'YYYY-MM') AS month, count(*) AS n
    FROM "Transaction"
    WHERE "householdId" = ${viewer.householdId} AND "date" >= ${new Date(`${months[0]}-01T00:00:00Z`)}
    GROUP BY 1, 2`;
  const have = new Set(rows.map((r) => `${r.accountId}|${r.month}`));
  return {
    months,
    accounts: accounts.map((a) => {
      const covered = months.map((mo) => have.has(`${a.id}|${mo}`));
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        covered,
        monthsCovered: covered.filter(Boolean).length,
      };
    }),
  };
}
