import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { detectTransfers, MAX_DAYS } from "./transfers";

const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86_400_000);

/** Detect card payments / own-account transfers in [from, to] (plus a matching window). */
export async function runTransferDetection(
  db: PrismaClient,
  householdId: string,
  from: string,
  to: string,
): Promise<number> {
  const txns = await db.transaction.findMany({
    where: {
      householdId,
      date: { gte: shift(from, -MAX_DAYS), lte: shift(to, MAX_DAYS) },
      // Unpaired transfers stay candidates so a one-sided leg pairs once the other side arrives.
      categorySource: { not: "USER" },
    },
    include: { account: { select: { type: true } } },
  });
  const updates = detectTransfers(
    txns.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      accountType: t.account.type,
      date: t.date.toISOString().slice(0, 10),
      amountCents: t.amountCents,
      merchantNorm: t.merchantNorm,
      transferPairId: t.transferPairId,
    })),
    randomUUID,
  );
  if (updates.length === 0) return 0;
  const transfers = await db.category.findFirst({ where: { householdId, name: "Transfers" } });
  await db.$transaction(
    updates.map((u) =>
      db.transaction.update({
        where: { id: u.id },
        data: {
          isTransfer: true,
          transferPairId: u.transferPairId,
          categoryId: transfers?.id ?? null,
          categorySource: "RULE",
          categoryConfidence: 1,
          needsReview: false,
        },
      }),
    ),
  );
  return updates.length;
}
