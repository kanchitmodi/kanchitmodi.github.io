import type { Prisma, PrismaClient } from "@prisma/client";
import { categorize, REVIEW_THRESHOLD, ruleApplies, type UserRule } from "./categorize";
import { aiBudget, claudeClient, recordUsage, type ClaudeClient } from "./ai/claude";
import { llmCategorize, LLM_BATCH } from "./ai/categorize-llm";

export async function loadUserRules(db: PrismaClient, householdId: string): Promise<UserRule[]> {
  const rules = await db.categoryRule.findMany({
    where: { householdId },
    include: { category: true },
  });
  return rules.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    match: r.match,
    categoryName: r.category.name,
    isPrivate: r.isPrivate,
    createdById: r.createdById,
  }));
}

export interface CategorizeOptions {
  /** Inject a client (tests) or null to disable the LLM step */
  llm?: ClaudeClient | null;
}

/**
 * (Re)categorize transactions. Never touches anything the user categorized by hand (source USER).
 * Unknown merchants go to Claude (cached per merchant, within the monthly cap); low-confidence
 * guesses are flagged for review.
 */
export async function categorizeTransactions(
  db: PrismaClient,
  householdId: string,
  where: Prisma.TransactionWhereInput,
  opts: CategorizeOptions = {},
): Promise<{ categorized: number; llm: number; review: number }> {
  const [txns, rules, categories] = await Promise.all([
    db.transaction.findMany({
      where: { ...where, householdId, categorySource: { not: "USER" } },
      include: { account: { select: { ownerUserId: true } } },
    }),
    loadUserRules(db, householdId),
    db.category.findMany({ where: { householdId } }),
  ]);
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const unknown: typeof txns = [];
  let categorized = 0;
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const ruleHits = new Map<string, number>();

  for (const t of txns) {
    const r = categorize(
      {
        merchantNorm: t.merchantNorm,
        amountCents: t.amountCents,
        isTransfer: t.isTransfer,
        accountOwnerUserId: t.account.ownerUserId,
      },
      rules,
    );
    const cat = r.categoryName ? catByName.get(r.categoryName) : undefined;
    if (!cat) {
      unknown.push(t);
      continue;
    }
    if (r.ruleId) ruleHits.set(r.ruleId, (ruleHits.get(r.ruleId) ?? 0) + 1);
    categorized++;
    writes.push(
      db.transaction.update({
        where: { id: t.id },
        data: {
          categoryId: cat.id,
          categorySource: r.source,
          categoryConfidence: r.confidence,
          needsReview: r.confidence < REVIEW_THRESHOLD,
        },
      }),
    );
  }
  for (const [id, n] of ruleHits)
    writes.push(db.categoryRule.update({ where: { id }, data: { hits: { increment: n } } }));
  await db.$transaction(writes);

  // LLM fallback for what rules couldn't place.
  let llmCount = 0;
  let review = 0;
  if (unknown.length) {
    const merchants = [...new Set(unknown.map((t) => t.merchantNorm))];
    const cache = new Map(
      (
        await db.merchantCategoryCache.findMany({
          where: { householdId, merchantNorm: { in: merchants } },
        })
      ).map((c) => [c.merchantNorm, c]),
    );
    const missing = merchants.filter((m) => !cache.has(m));
    const client = opts.llm === undefined ? claudeClient() : opts.llm;
    if (client && missing.length) {
      const budget = await aiBudget(db, householdId);
      if (!budget.exhausted) {
        for (let i = 0; i < missing.length; i += LLM_BATCH) {
          const batch = missing.slice(i, i + LLM_BATCH).map((m) => ({
            merchantNorm: m,
            direction: (unknown.find((t) => t.merchantNorm === m)!.amountCents < 0
              ? "out"
              : "in") as "in" | "out",
          }));
          try {
            const { guesses, usage, model } = await llmCategorize(
              client,
              batch,
              categories.map((c) => c.name),
            );
            if (usage) await recordUsage(db, householdId, "categorize", model, usage);
            for (const g of guesses) {
              const cat = catByName.get(g.category);
              if (!cat) continue;
              const row = await db.merchantCategoryCache.upsert({
                where: { householdId_merchantNorm: { householdId, merchantNorm: g.merchant } },
                create: {
                  householdId,
                  merchantNorm: g.merchant,
                  categoryId: cat.id,
                  confidence: g.confidence,
                },
                update: { categoryId: cat.id, confidence: g.confidence },
              });
              cache.set(g.merchant, row);
            }
          } catch (e) {
            console.warn("LLM categorization failed; leaving for review", (e as Error).message);
            break;
          }
          if ((await aiBudget(db, householdId)).exhausted) break;
        }
      }
    }
    const llmWrites: Prisma.PrismaPromise<unknown>[] = [];
    for (const t of unknown) {
      const c = cache.get(t.merchantNorm);
      if (c) {
        llmCount++;
        const needsReview = c.confidence < REVIEW_THRESHOLD;
        if (needsReview) review++;
        llmWrites.push(
          db.transaction.update({
            where: { id: t.id },
            data: {
              categoryId: c.categoryId,
              categorySource: "LLM",
              categoryConfidence: c.confidence,
              needsReview,
            },
          }),
        );
      } else {
        review++;
        llmWrites.push(
          db.transaction.update({
            where: { id: t.id },
            data: { needsReview: true, categorySource: "NONE", categoryConfidence: 0 },
          }),
        );
      }
    }
    await db.$transaction(llmWrites);
  }
  return { categorized, llm: llmCount, review };
}

/**
 * A correction becomes a rule: "always put <merchant> in <category>". Rules learned from a PRIVATE
 * account are private to their creator, so the merchant never shows up for the other member.
 * Re-applies the rule to matching transactions that weren't categorized by hand.
 */
export async function learnRule(
  db: PrismaClient,
  args: {
    householdId: string;
    userId: string;
    merchantNorm: string;
    categoryId: string;
    isPrivate: boolean;
  },
): Promise<{ ruleId: string; updated: number }> {
  const createdById = args.userId;
  const rule = await db.categoryRule.upsert({
    where: {
      householdId_pattern_match_createdById: {
        householdId: args.householdId,
        pattern: args.merchantNorm,
        match: "EXACT",
        createdById,
      },
    },
    create: {
      householdId: args.householdId,
      pattern: args.merchantNorm,
      match: "EXACT",
      categoryId: args.categoryId,
      createdById,
      isPrivate: args.isPrivate,
    },
    update: { categoryId: args.categoryId, isPrivate: args.isPrivate },
  });
  const candidates = await db.transaction.findMany({
    where: {
      householdId: args.householdId,
      merchantNorm: args.merchantNorm,
      categorySource: { not: "USER" },
      isTransfer: false,
    },
    select: { id: true, account: { select: { ownerUserId: true } } },
  });
  const ids = candidates
    .filter((t) => ruleApplies({ isPrivate: args.isPrivate, createdById }, t.account.ownerUserId))
    .map((t) => t.id);
  const r = await db.transaction.updateMany({
    where: { id: { in: ids } },
    data: {
      categoryId: args.categoryId,
      categorySource: "RULE",
      categoryConfidence: 1,
      needsReview: false,
    },
  });
  return { ruleId: rule.id, updated: r.count };
}
