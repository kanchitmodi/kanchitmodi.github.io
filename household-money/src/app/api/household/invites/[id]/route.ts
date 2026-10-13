import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { canManageHousehold } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { viewer } = await requireApiAuth();
    if (!canManageHousehold(viewer)) throw new ApiError(403, "forbidden");
    const { id } = await ctx.params;
    const r = await db.invite.updateMany({
      where: { id, householdId: viewer.householdId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (r.count === 0) throw new ApiError(404, "not_found");
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "household.invite_revoked",
      entityType: "invite",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  },
);
