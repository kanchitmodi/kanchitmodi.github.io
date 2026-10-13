import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { currentScope } from "@/lib/scope-server";
import { listAccounts, listTransactions } from "@/lib/data";
import { PageHeader, TxnRow } from "@/components/ui";

export const metadata = { title: "Activity" };

type SP = {
  q?: string;
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  review?: string;
  uncategorized?: string;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { viewer } = await requirePageAuth();
  const { scope } = await currentScope(viewer);
  const sp = await searchParams;
  const review = sp.review === "1";
  const uncategorized = sp.uncategorized === "1";
  const [txns, accounts, categories, reviewCount] = await Promise.all([
    listTransactions(viewer, scope, {
      q: sp.q?.slice(0, 100) || undefined,
      accountId: sp.account || undefined,
      categoryId: sp.category || undefined,
      from: sp.from && DATE.test(sp.from) ? sp.from : undefined,
      to: sp.to && DATE.test(sp.to) ? sp.to : undefined,
      review,
      uncategorized,
      limit: 300,
    }),
    listAccounts(viewer, scope),
    db.category.findMany({
      where: { householdId: viewer.householdId },
      orderBy: [{ sortOrder: "asc" }],
    }),
    listTransactions(viewer, scope, { review: true, limit: 500 }).then((r) => r.length),
  ]);
  const filtered = Boolean(
    sp.q || sp.account || sp.category || sp.from || sp.to || review || uncategorized,
  );

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle={`${txns.length}${txns.length === 300 ? "+" : ""} transactions`}
        action={
          <Link href="/import" className="btn btn-primary">
            Import
          </Link>
        }
      />
      <nav aria-label="Quick filters" className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link
          href="/transactions"
          aria-current={!filtered ? "page" : undefined}
          className={`tap inline-flex items-center rounded-full border border-border px-3 ${!filtered ? "bg-accent-soft font-semibold text-accent" : ""}`}
        >
          All
        </Link>
        <Link
          href="/transactions?review=1"
          aria-current={review ? "page" : undefined}
          className={`tap inline-flex items-center rounded-full border border-border px-3 ${review ? "bg-accent-soft font-semibold text-accent" : ""}`}
          data-testid="review-filter"
        >
          Review queue{reviewCount ? ` · ${reviewCount}` : ""}
        </Link>
        <Link
          href="/transactions?uncategorized=1"
          aria-current={uncategorized ? "page" : undefined}
          className={`tap inline-flex items-center rounded-full border border-border px-3 ${uncategorized ? "bg-accent-soft font-semibold text-accent" : ""}`}
        >
          Uncategorized
        </Link>
      </nav>
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="sr-only">
            Search merchant, description or notes
          </label>
          <input
            id="q"
            name="q"
            defaultValue={sp.q}
            placeholder="Search merchant, notes…"
            className="input"
            type="search"
          />
        </div>
        <div>
          <label htmlFor="account" className="sr-only">
            Account
          </label>
          <select id="account" name="account" defaultValue={sp.account ?? ""} className="input">
            <option value="">All accounts</option>
            {accounts
              .filter((a) => a.access === "full")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="sr-only">
            Category
          </label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="sr-only">
            From date
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={sp.from}
            className="input"
            aria-label="From date"
          />
        </div>
        <div className="flex gap-2">
          <label htmlFor="to" className="sr-only">
            To date
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={sp.to}
            className="input"
            aria-label="To date"
          />
          <button className="btn btn-secondary">Filter</button>
        </div>
      </form>
      <ul className="card divide-y divide-border overflow-hidden">
        {txns.map((t) => (
          <TxnRow key={t.id} t={t} />
        ))}
        {txns.length === 0 && (
          <li className="p-4 text-sm text-text-2">
            {review ? (
              "Nothing to review. 🎉"
            ) : filtered ? (
              "No matching transactions."
            ) : (
              <>
                No transactions yet.{" "}
                <Link href="/import" className="font-semibold text-accent underline">
                  Import a CSV
                </Link>{" "}
                to get started.
              </>
            )}
          </li>
        )}
      </ul>
    </>
  );
}
