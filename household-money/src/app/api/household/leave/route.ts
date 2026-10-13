import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { destroySession } from "@/lib/session";

/**
 * Member leaves the household. Their individual accounts (and those accounts' transactions) go with
 * them — deleted from this household. Joint accounts stay. The owner can't leave (transfer first).
 */
export const POST = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  if (viewer.role === "OWNER")
    throw new ApiError(400, "owner_cannot_leave", "The owner can't leave the household.");
  await db.$transaction([
    db.account.deleteMany({
      where: {
        householdId: viewer.householdId,
        ownerType: "INDIVIDUAL",
        ownerUserId: viewer.userId,
      },
    }),
    db.transaction.updateMany({
      where: { householdId: viewer.householdId, spenderUserId: viewer.userId },
      data: { spenderUserId: null },
    }),
    db.membership.delete({ where: { userId: viewer.userId } }),
  ]);
  await audit({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: "household.left",
  });
  await destroySession();
  return NextResponse.json({ ok: true });
});
