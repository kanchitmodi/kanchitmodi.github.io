import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { PageHeader } from "@/components/ui";
import { CategoriesEditor, RulesList } from "./categories-client";

export const metadata = { title: "Categories & rules" };

export default async function CategoriesPage() {
  const { viewer } = await requirePageAuth();
  const [categories, rules, budget] = await Promise.all([
    db.category.findMany({
      where: { householdId: viewer.householdId },
      orderBy: [{ sortOrder: "asc" }],
      include: { _count: { select: { txns: true } } },
    }),
    db.categoryRule.findMany({
      where: {
        householdId: viewer.householdId,
        OR: [{ isPrivate: false }, { createdById: viewer.userId }],
      },
      include: { category: true, createdBy: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    import("@/lib/ai/claude").then((m) => m.aiBudget(db, viewer.householdId)),
  ]);
  return (
    <>
      <PageHeader
        title="Categories & rules"
        subtitle="Your corrections become rules automatically"
      />
      <CategoriesEditor
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          kind: c.kind,
          count: c._count.txns,
        }))}
      />
      <RulesList
        rules={rules.map((r) => ({
          id: r.id,
          pattern: r.pattern,
          category: r.category.name,
          isPrivate: r.isPrivate,
          createdBy: r.createdBy?.name ?? "—",
          hits: r.hits,
        }))}
      />
      <section className="card mt-4 p-4 text-sm" data-testid="ai-usage">
        <h2 className="font-semibold">Claude categorization this month</h2>
        <p className="mt-1 text-text-2">
          ${(budget.spentMicros / 1_000_000).toFixed(2)} of $
          {(budget.capMicros / 1_000_000).toFixed(2)} USD monthly cap
          {budget.exhausted
            ? " — cap reached; new merchants go to the review queue"
            : budget.warning
              ? " — ▲ over 80%"
              : ""}
          . Only merchant names are sent — never amounts, dates, account numbers or names.
        </p>
      </section>
    </>
  );
}
