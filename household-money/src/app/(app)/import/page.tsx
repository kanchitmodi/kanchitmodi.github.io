import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { coverage, importableAccounts } from "@/lib/import/service";
import { todayInToronto } from "@/lib/finance";
import { PageHeader } from "@/components/ui";
import { CONNECTIONS } from "@config/connections";
import { ImportFlow } from "./import-client";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const { viewer } = await requirePageAuth();
  const [accounts, cov, recent] = await Promise.all([
    importableAccounts(db, viewer),
    coverage(db, viewer, todayInToronto()),
    db.importBatch.findMany({
      where: { householdId: viewer.householdId, userId: viewer.userId, status: "COMMITTED" },
      orderBy: { committedAt: "desc" },
      take: 8,
    }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const institutions = [...new Set(CONNECTIONS.map((c) => c.institution))];
  return (
    <>
      <PageHeader
        title="Import"
        subtitle="CSV or PDF statements · Wealthsimple, TD, CIBC, Scotiabank, PC Financial, Rogers, Questrade, IBKR"
      />
      <ImportFlow
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.institution,
          type: a.type,
          mask: a.mask,
          joint: a.ownerType === "JOINT",
        }))}
        institutions={institutions}
      />

      {/* Scrolls sideways on phones, so it must be keyboard-focusable */}
      <section
        className="card mt-6 overflow-x-auto p-4"
        aria-labelledby="cov-h"
        data-testid="coverage"
        tabIndex={0}
      >
        <h2 id="cov-h" className="font-semibold">
          History backfill (last 12 months)
        </h2>
        <p className="mb-3 text-sm text-text-2">
          Aim for 6–12 months per account. Each square is a month with transactions.
        </p>
        {cov.accounts.length === 0 ? (
          <p className="text-sm text-text-2">No accounts yet — add one above when you import.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3 text-left font-medium text-text-2">
                  Account
                </th>
                <th scope="col" className="py-1 text-left font-medium text-text-2">
                  {cov.months[0]} → {cov.months.at(-1)}
                </th>
                <th scope="col" className="py-1 pl-3 text-right font-medium text-text-2">
                  Months
                </th>
              </tr>
            </thead>
            <tbody>
              {cov.accounts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap">
                    {a.name}
                  </th>
                  <td className="py-2">
                    <div
                      className="flex gap-0.5"
                      aria-label={`${a.monthsCovered} of 12 months covered`}
                    >
                      {a.covered.map((c, i) => (
                        <span
                          key={i}
                          title={cov.months[i]}
                          className={`h-4 w-3 rounded-sm ${c ? "bg-accent" : "bg-surface-2 ring-1 ring-border"}`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {a.monthsCovered}/12 {a.monthsCovered >= 6 ? "✓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {recent.length > 0 && (
        <section className="card mt-6 p-4" aria-labelledby="recent-imports">
          <h2 id="recent-imports" className="mb-2 font-semibold">
            Your recent imports
          </h2>
          <ul className="divide-y divide-border text-sm">
            {recent.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {b.filename} → {accountName.get(b.accountId ?? "") ?? "account"}
                </span>
                <span className="text-text-3">
                  {b.importedCount} added · {b.duplicateCount} duplicates ·{" "}
                  {b.committedAt?.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
