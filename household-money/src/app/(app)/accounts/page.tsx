import { requirePageAuth } from "@/lib/auth-guard";
import { currentScope } from "@/lib/scope-server";
import { listAccounts, type AccountView } from "@/lib/data";
import { formatCents } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/ui";
import { VisibilityControl } from "./visibility-control";

export const metadata = { title: "Accounts" };

const TYPE_LABEL: Record<AccountView["type"], string> = {
  CHEQUING: "Chequing",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  INVESTMENT: "Investment",
  LOAN: "Loan",
  OTHER: "Other",
};

export default async function AccountsPage() {
  const { viewer } = await requirePageAuth();
  const { scope, members } = await currentScope(viewer);
  const accounts = await listAccounts(viewer, scope);
  const groups: { key: string; title: string; items: AccountView[] }[] = [
    ...members.map((m) => ({
      key: m.id,
      title: m.name,
      items: accounts.filter((a) => a.ownerType === "INDIVIDUAL" && a.ownerUserId === m.id),
    })),
    { key: "joint", title: "Joint", items: accounts.filter((a) => a.ownerType === "JOINT") },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Each person connects their own accounts. Joint accounts appear once."
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <h2
              id={`g-${g.key}`}
              className="mb-2 text-sm font-semibold tracking-wide text-text-2 uppercase"
            >
              {g.title}
            </h2>
            <ul className="card divide-y divide-border">
              {g.items.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  data-testid="account-row"
                  data-access={a.access}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {a.name}
                      {a.mask && <span className="text-text-3"> ··{a.mask}</span>}
                    </div>
                    <div className="text-xs text-text-3">
                      {a.institution ? `${a.institution} · ` : ""}
                      {TYPE_LABEL[a.type]}
                      {a.subtype ? ` · ${a.subtype.replace("_", "-")}` : ""}
                      {a.access === "balance" ? " · balance only" : ""}
                    </div>
                  </div>
                  {a.status && <StatusBadge status={a.status} />}
                  {a.ownerUserId === viewer.userId && a.ownerType === "INDIVIDUAL" && (
                    <VisibilityControl
                      accountId={a.id}
                      name={a.name}
                      initial={
                        a.visibility === "SHARED" ? "SHARED" : (a.privateMode ?? "BALANCE_ONLY")
                      }
                    />
                  )}
                  <div className="w-28 text-right font-semibold tabular-nums">
                    {formatCents(a.balanceCents)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
