import { requirePageAuth } from "@/lib/auth-guard";
import { currentScope } from "@/lib/scope-server";
import { listAccounts, listTransactions } from "@/lib/data";
import { PageHeader, StageNote, TxnRow } from "@/components/ui";

export const metadata = { title: "Activity" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; account?: string }>;
}) {
  const { viewer } = await requirePageAuth();
  const { scope } = await currentScope(viewer);
  const { q, account } = await searchParams;
  const [txns, accounts] = await Promise.all([
    listTransactions(viewer, scope, { q: q?.slice(0, 100), accountId: account, limit: 200 }),
    listAccounts(viewer, scope),
  ]);
  return (
    <>
      <PageHeader title="Activity" subtitle={`${txns.length} transactions`} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">
          Search merchants
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search merchants"
          className="input sm:flex-1"
          type="search"
        />
        <label htmlFor="account" className="sr-only">
          Account
        </label>
        <select id="account" name="account" defaultValue={account ?? ""} className="input sm:w-64">
          <option value="">All accounts</option>
          {accounts
            .filter((a) => a.access === "full")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      <ul className="card divide-y divide-border overflow-hidden">
        {txns.map((t) => (
          <TxnRow key={t.id} t={t} />
        ))}
        {txns.length === 0 && (
          <li className="p-4 text-sm text-text-2">No matching transactions.</li>
        )}
      </ul>
      <div className="mt-4">
        <StageNote stage={2}>
          Category edits, splits, notes, comments, transfer detection and CSV/PDF import arrive
          next.
        </StageNote>
      </div>
    </>
  );
}
