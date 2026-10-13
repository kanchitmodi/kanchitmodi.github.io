import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { viewer } = await requirePageAuth();
  const rows = await db.auditLog.findMany({
    where: { householdId: viewer.householdId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Visible to both members" />
      <ul className="card divide-y divide-border text-sm" data-testid="audit-log">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
            <span>
              <strong>{r.actor?.name ?? "System"}</strong> · <code>{r.action}</code>
            </span>
            <time className="text-text-3" dateTime={r.createdAt.toISOString()}>
              {r.createdAt.toLocaleString("en-CA", { timeZone: "America/Toronto" })}
            </time>
          </li>
        ))}
      </ul>
    </>
  );
}
