import type { Prisma, PrismaClient } from "@prisma/client";
import { accountAccess, canEditTransactions, type Viewer } from "./permissions";
import { learnRule, categorizeTransactions } from "./categorize-service";
import { validateSplits, type SplitInput } from "./splits";

export class TxnError extends Error {
  constructor(
    public code: "not_found" | "invalid",
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function loadEditable(db: PrismaClient, viewer: Viewer, id: string) {
  const t = await db.transaction.findUnique({
    where: { id },
    include: { account: true, category: true },
  });
  // Same 404 whether it doesn't exist or belongs to someone else's private account.
  if (!t || t.householdId !== viewer.householdId || !canEditTransactions(viewer, t.account))
    throw new TxnError("not_found");
  return t;
}

export async function getTransactionDetail(db: PrismaClient, viewer: Viewer, id: string) {
  const t = await db.transaction.findUnique({
    where: { id },
    include: {
      account: true,
      category: true,
      spender: { select: { id: true, name: true, avatarColor: true } },
      splits: { include: { category: true } },
      comments: {
        include: { user: { select: { id: true, name: true, avatarColor: true } } },
        orderBy: { createdAt: "asc" },
      },
      events: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!t || t.householdId !== viewer.householdId || accountAccess(viewer, t.account) !== "full")
    throw new TxnError("not_found");
  let pair: { id: string; accountName: string } | null = null;
  if (t.transferPairId) {
    const other = await db.transaction.findFirst({
      where: { transferPairId: t.transferPairId, id: { not: t.id } },
      include: { account: true },
    });
    if (other && accountAccess(viewer, other.account) === "full")
      pair = { id: other.id, accountName: other.account.name };
  }
  return {
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    amountCents: t.amountCents,
    currency: t.currency,
    merchant: t.merchant,
    merchantRaw: t.merchantRaw,
    merchantNorm: t.merchantNorm,
    notes: t.notes,
    isTransfer: t.isTransfer,
    pending: t.pending,
    source: t.source,
    categorySource: t.categorySource,
    categoryConfidence: t.categoryConfidence,
    needsReview: t.needsReview,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
    account: {
      id: t.account.id,
      name: t.account.name,
      institution: t.account.institution,
      private: t.account.visibility === "PRIVATE",
    },
    spender: t.spender,
    transferPair: pair,
    splits: t.splits.map((s) => ({
      id: s.id,
      amountCents: s.amountCents,
      note: s.note,
      category: s.category
        ? { id: s.category.id, name: s.category.name, color: s.category.color }
        : null,
    })),
    comments: t.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
    })),
    history: t.events.map((e) => ({
      id: e.id,
      field: e.field,
      from: e.fromValue,
      to: e.toValue,
      at: e.createdAt.toISOString(),
      by: e.user?.name ?? "System",
    })),
  };
}

export async function updateTransaction(
  db: PrismaClient,
  viewer: Viewer,
  id: string,
  patch: {
    categoryId?: string | null;
    applyToMerchant?: boolean;
    notes?: string | null;
    isTransfer?: boolean;
  },
) {
  const t = await loadEditable(db, viewer, id);
  const data: Prisma.TransactionUpdateInput = {};
  const events: { field: string; fromValue: string | null; toValue: string | null }[] = [];
  let learned: { ruleId: string; updated: number } | null = null;

  if (patch.categoryId !== undefined && patch.categoryId !== t.categoryId) {
    const cat = patch.categoryId
      ? await db.category.findFirst({
          where: { id: patch.categoryId, householdId: viewer.householdId },
        })
      : null;
    if (patch.categoryId && !cat) throw new TxnError("invalid", "Unknown category");
    data.category = cat ? { connect: { id: cat.id } } : { disconnect: true };
    data.categorySource = "USER";
    data.categoryConfidence = 1;
    data.needsReview = false;
    events.push({
      field: "category",
      fromValue: t.category?.name ?? null,
      toValue: cat?.name ?? null,
    });
  } else if (patch.categoryId !== undefined && t.needsReview) {
    // Confirming the suggested category clears it from the review queue.
    data.categorySource = "USER";
    data.needsReview = false;
    events.push({
      field: "category",
      fromValue: t.category?.name ?? null,
      toValue: `${t.category?.name ?? "—"} (confirmed)`,
    });
  }

  if (patch.notes !== undefined && (patch.notes ?? "") !== (t.notes ?? "")) {
    const notes = patch.notes?.trim().slice(0, 1000) || null;
    data.notes = notes;
    events.push({ field: "notes", fromValue: t.notes, toValue: notes });
  }

  if (patch.isTransfer !== undefined && patch.isTransfer !== t.isTransfer) {
    data.isTransfer = patch.isTransfer;
    data.categorySource = "USER";
    data.needsReview = false;
    if (patch.isTransfer) {
      const tr = await db.category.findFirst({
        where: { householdId: viewer.householdId, name: "Transfers" },
      });
      if (tr) data.category = { connect: { id: tr.id } };
    } else {
      data.transferPairId = null;
      if (t.category?.name === "Transfers") data.category = { disconnect: true };
      if (t.transferPairId) {
        await db.transaction.updateMany({
          where: { transferPairId: t.transferPairId, id: { not: t.id } },
          data: { transferPairId: null },
        });
      }
    }
    events.push({
      field: "transfer",
      fromValue: String(t.isTransfer),
      toValue: String(patch.isTransfer),
    });
  }

  if (events.length === 0) return { changed: false, learned };
  await db.$transaction([
    db.transaction.update({ where: { id }, data }),
    db.transactionEvent.createMany({
      data: events.map((e) => ({ ...e, transactionId: id, userId: viewer.userId })),
    }),
    db.auditLog.create({
      data: {
        householdId: viewer.householdId,
        actorUserId: viewer.userId,
        action: "txn.edit",
        entityType: "transaction",
        entityId: id,
        details: { fields: events.map((e) => e.field) },
      },
    }),
  ]);

  if (patch.isTransfer === false && !patch.categoryId) {
    // Un-marking a transfer: let the rules suggest a category again (needs review if unsure).
    await db.transaction.update({ where: { id }, data: { categorySource: "NONE" } });
    await categorizeTransactions(db, viewer.householdId, { id }, { llm: null });
  }

  if (patch.applyToMerchant && patch.categoryId && t.merchantNorm) {
    learned = await learnRule(db, {
      householdId: viewer.householdId,
      userId: viewer.userId,
      merchantNorm: t.merchantNorm,
      categoryId: patch.categoryId,
      isPrivate: t.account.ownerType === "INDIVIDUAL" && t.account.visibility === "PRIVATE",
    });
  }
  return { changed: true, learned };
}

export async function setSplits(
  db: PrismaClient,
  viewer: Viewer,
  id: string,
  splits: SplitInput[],
) {
  const t = await loadEditable(db, viewer, id);
  const problem = validateSplits(t.amountCents, splits);
  if (problem) throw new TxnError("invalid", problem);
  const catIds = [...new Set(splits.map((s) => s.categoryId).filter((c): c is string => !!c))];
  if (catIds.length) {
    const n = await db.category.count({
      where: { id: { in: catIds }, householdId: viewer.householdId },
    });
    if (n !== catIds.length) throw new TxnError("invalid", "Unknown category");
  }
  await db.$transaction([
    db.transactionSplit.deleteMany({ where: { transactionId: id } }),
    db.transactionSplit.createMany({
      data: splits.map((s) => ({
        transactionId: id,
        categoryId: s.categoryId,
        amountCents: s.amountCents,
        note: s.note?.slice(0, 200) || null,
      })),
    }),
    db.transactionEvent.create({
      data: {
        transactionId: id,
        userId: viewer.userId,
        field: "splits",
        fromValue: null,
        toValue: splits.length ? `${splits.length} parts` : "removed",
      },
    }),
    db.auditLog.create({
      data: {
        householdId: viewer.householdId,
        actorUserId: viewer.userId,
        action: "txn.edit",
        entityType: "transaction",
        entityId: id,
        details: { fields: ["splits"] },
      },
    }),
  ]);
}

export async function addComment(db: PrismaClient, viewer: Viewer, id: string, body: string) {
  await loadEditable(db, viewer, id);
  const text = body.trim().slice(0, 1000);
  if (!text) throw new TxnError("invalid", "Comment is empty");
  const c = await db.transactionComment.create({
    data: { transactionId: id, userId: viewer.userId, body: text },
  });
  await db.auditLog.create({
    data: {
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "txn.comment",
      entityType: "transaction",
      entityId: id,
    },
  });
  return c;
}
