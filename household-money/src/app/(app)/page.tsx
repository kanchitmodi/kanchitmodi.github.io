import { requirePageAuth } from "@/lib/auth-guard";
import { currentScope } from "@/lib/scope-server";
import { homeSummary, listAccounts, listTransactions } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { PageHeader, StageNote, StatTile, TxnRow } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const { viewer } = await requirePageAuth();
  const { scope, members } = await currentScope(viewer);
  const [summary, recent, accounts] = await Promise.all([
    homeSummary(viewer, scope),
    listTransactions(viewer, scope, { limit: 8 }),
    listAccounts(viewer, scope),
  ]);
  const who =
    scope.kind === "household"
      ? "Household"
      : (members.find((m) => m.id === scope.userId)?.name ?? "");
  const rate = summary.month.savingsRateBp;
  const monthLabel = new Date(`${summary.month.from}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <PageHeader title={who} subtitle={`${monthLabel} · ${summary.accountCount} accounts`} />
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          testId="kpi-networth"
          label="Net worth"
          value={formatCents(summary.netWorth.netCents, { whole: true })}
          caption={`${formatCents(summary.netWorth.assetsCents, { whole: true })} assets · ${formatCents(summary.netWorth.liabilitiesCents, { whole: true })} owed`}
        />
        <StatTile
          testId="kpi-spend"
          label="Spent this month"
          value={formatCents(summary.month.spendCents, { whole: true })}
          caption="Budgets arrive in Stage 3"
        />
        <StatTile
          testId="kpi-income"
          label="Income this month"
          value={formatCents(summary.month.incomeCents, { whole: true })}
        />
        <StatTile
          testId="kpi-savings"
          label="Savings rate"
          value={rate === null ? "—" : `${(rate / 100).toFixed(1)}%`}
          caption="Income minus spending, month to date"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-h" className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 id="recent-h" className="font-semibold">
              Recent activity
            </h2>
            <Link
              href="/transactions"
              className="tap flex items-center text-sm font-semibold text-accent"
            >
              See all
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
            {recent.length === 0 && (
              <li className="p-4 text-sm text-text-2">No transactions yet.</li>
            )}
          </ul>
        </section>
        <section aria-labelledby="acct-h" className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 id="acct-h" className="font-semibold">
              Accounts
            </h2>
            <Link
              href="/accounts"
              className="tap flex items-center text-sm font-semibold text-accent"
            >
              Manage
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {accounts.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="flex min-h-[52px] items-center justify-between px-4 py-2 text-sm"
              >
                <span className="truncate">
                  {a.name}
                  {a.mask ? ` ··${a.mask}` : ""}
                </span>
                <span className="font-semibold tabular-nums">{formatCents(a.balanceCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-6">
        <StageNote stage={3}>
          Budgets, spending trend, allocation, upcoming bills and AI insights land on this screen in
          Stages 3–10.
        </StageNote>
      </div>
    </>
  );
}
