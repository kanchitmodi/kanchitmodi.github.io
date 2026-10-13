import { requirePageAuth } from "@/lib/auth-guard";
import { CONNECTIONS, plaidItemUsage, wouldExceedPlaidBudget } from "@config/connections";
import { PageHeader, StageNote } from "@/components/ui";

export const metadata = { title: "Connections" };

const PROVIDER_LABEL = {
  plaid: "Plaid",
  email: "Gmail alerts",
  csv: "CSV",
  snaptrade: "SnapTrade",
} as const;

export default async function ConnectionsPage() {
  await requirePageAuth();
  const usage = plaidItemUsage();
  const tight = wouldExceedPlaidBudget(usage, 1);
  return (
    <>
      <PageHeader
        title="Connections"
        subtitle="Planned from config/connections.ts — edit that file to add a bank or card"
      />
      <section className="card mb-4 p-4" data-testid="plaid-usage">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Plaid Items used</h2>
          <span className="text-2xl font-bold tabular-nums">
            {usage.used}/{usage.limit}
          </span>
        </div>
        <p className="mt-1 text-sm text-text-2">
          Kanchit {usage.byPerson.kanchit} · Wife {usage.byPerson.wife} · {usage.reserve} reserved
          for re-links · {Math.max(usage.available, 0)} free
        </p>
        <p className="mt-2 text-xs text-text-3">
          Trial plan note: removing an Item does not free a slot. Re-authenticate with update mode —
          never re-link.
        </p>
        {tight && (
          <p role="alert" className="mt-2 text-sm text-warn">
            ▲ Linking another bank would use a reserved slot — use CSV or email mode instead.
          </p>
        )}
      </section>
      <ul className="card divide-y divide-border">
        {CONNECTIONS.map((c) => (
          <li key={c.key} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {c.institution}{" "}
                <span className="text-text-3">· {c.person === "kanchit" ? "Kanchit" : "Wife"}</span>
              </span>
              <span className="text-xs text-text-2">
                {PROVIDER_LABEL[c.provider]}
                {c.fallbacks.length
                  ? ` → ${c.fallbacks.map((f) => PROVIDER_LABEL[f]).join(", ")}`
                  : ""}{" "}
                · {c.tier} · {c.plaidItems} Item{c.plaidItems === 1 ? "" : "s"}
                {c.flaky ? " · ⚠ known-flaky" : ""}
              </span>
            </div>
            <div className="text-xs text-text-3">
              {c.accounts
                .map((a) => `${a.name}${a.owner === "joint" ? " (joint)" : ""}`)
                .join(", ")}
            </div>
            {c.note && <div className="text-xs text-text-3">{c.note}</div>}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <StageNote stage={5}>
          Live linking (Plaid Link, update mode, 48-hour verification of flaky institutions) arrives
          in Stages 4–6. Setup steps 0–4 must be completed first.
        </StageNote>
      </div>
    </>
  );
}
