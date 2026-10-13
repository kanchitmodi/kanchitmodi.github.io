import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";

/** Delete the caller's individual accounts and their transactions. Joint accounts are kept. */
export const DELETE = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  const r = await db.account.deleteMany({
    where: { householdId: viewer.householdId, ownerType: "INDIVIDUAL", ownerUserId: viewer.userId },
  });
  await audit({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: "data.delete",
    details: { accounts: r.count },
  });
  return NextResponse.json({ ok: true, deletedAccounts: r.count });
});
