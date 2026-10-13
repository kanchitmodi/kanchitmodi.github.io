export interface SplitInput {
  categoryId: string | null;
  amountCents: number;
  note?: string | null;
}

/** Splits must have 2+ parts, all with the transaction's sign, summing exactly to its amount. */
export function validateSplits(totalCents: number, splits: SplitInput[]): string | null {
  if (splits.length === 0) return null; // clearing splits
  if (splits.length < 2) return "A split needs at least two parts";
  if (splits.length > 20) return "Too many parts";
  for (const s of splits) {
    if (!Number.isInteger(s.amountCents) || s.amountCents === 0)
      return "Each part needs a non-zero amount";
    if (Math.sign(s.amountCents) !== Math.sign(totalCents))
      return "Parts must have the same sign as the transaction";
  }
  const sum = splits.reduce((a, s) => a + s.amountCents, 0);
  if (sum !== totalCents)
    return `Parts add up to ${(sum / 100).toFixed(2)}, not ${(totalCents / 100).toFixed(2)}`;
  return null;
}

/** Expand a transaction into per-category flows (one per split, or itself). */
export function expandSplits<T extends { amountCents: number; categoryId: string | null }>(
  txn: T,
  splits: { amountCents: number; categoryId: string | null }[],
): { amountCents: number; categoryId: string | null }[] {
  return splits.length
    ? splits.map((s) => ({ amountCents: s.amountCents, categoryId: s.categoryId }))
    : [{ amountCents: txn.amountCents, categoryId: txn.categoryId }];
}
