import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { getTransactionDetail, TxnError } from "@/lib/txn-service";
import { formatCents } from "@/lib/money";
import { Avatar } from "@/components/avatar";
import { TxnEditor } from "./txn-editor";

export const metadata = { title: "Transaction" };

const SOURCE_LABEL: Record<string, string> = {
  USER: "Set by you",
  RULE: "Rule",
  LLM: "Suggested by Claude",
  IMPORT: "From statement",
  DEMO: "Demo data",
  NONE: "Not categorized",
};

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer } = await requirePageAuth();
  const { id } = await params;
  let t;
  try {
    t = await getTransactionDetail(db, viewer, id);
  } catch (e) {
    if (e instanceof TxnError) notFound();
    throw e;
  }
  const categories = await db.category.findMany({
    where: { householdId: viewer.householdId },
    orderBy: [{ sortOrder: "asc" }],
  });

  return (
    <>
      <Link href="/transactions" className="tap mb-2 inline-flex items-center text-sm text-accent">
        ‹ Activity
      </Link>
      <header className="card mb-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{t.merchant}</h1>
            <p className="text-sm text-text-2">
              {t.date} · {t.account.name}
              {t.account.private ? " · 🔒 private account" : ""}
            </p>
            <p className="mt-1 truncate text-xs text-text-3" title={t.merchantRaw}>
              Statement text: {t.merchantRaw}
            </p>
          </div>
          <div className="text-right">
            <div
              className={`text-2xl font-bold tabular-nums ${t.amountCents > 0 ? "text-good" : ""}`}
              data-testid="txn-amount"
            >
              {formatCents(t.amountCents, { currency: t.currency })}
            </div>
            {t.spender && (
              <div className="mt-1 flex items-center justify-end gap-1 text-xs text-text-2">
                <Avatar name={t.spender.name} color={t.spender.avatarColor} size={20} />{" "}
                {t.spender.name}&apos;s card
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-text-3">
          Category source: {SOURCE_LABEL[t.categorySource] ?? t.categorySource}
          {t.categoryConfidence !== null && t.categorySource !== "USER"
            ? ` · ${Math.round(t.categoryConfidence * 100)}% confident`
            : ""}
          {t.needsReview ? " · ▲ needs review" : ""}
          {t.transferPair ? ` · matched with ${t.transferPair.accountName}` : ""}
        </p>
      </header>
      <TxnEditor
        txn={{
          id: t.id,
          amountCents: t.amountCents,
          merchant: t.merchant,
          notes: t.notes,
          isTransfer: t.isTransfer,
          needsReview: t.needsReview,
          categoryId: t.category?.id ?? null,
          splits: t.splits.map((s) => ({
            categoryId: s.category?.id ?? null,
            amountCents: s.amountCents,
            note: s.note,
          })),
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        comments={t.comments}
        history={t.history}
      />
    </>
  );
}
