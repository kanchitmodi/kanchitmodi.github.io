import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { accountAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/** Export the caller's own data (their accounts + transactions, and joint accounts) as JSON. */
export const GET = apiHandler(async () => {
  const { viewer, user } = await requireApiAuth();
  const accounts = (
    await db.account.findMany({ where: { householdId: viewer.householdId } })
  ).filter(
    (a) =>
      accountAccess(viewer, a) === "full" &&
      (a.ownerType === "JOINT" || a.ownerUserId === viewer.userId),
  );
  const txns = await db.transaction.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    include: { category: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  await audit({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: "data.export",
  });
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user: { name: user.name, email: user.email },
      accounts: accounts.map(({ householdId: _h, ...a }) => a),
      transactions: txns.map(({ householdId: _h, ...t }) => ({
        ...t,
        category: t.category?.name ?? null,
      })),
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="household-money-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
