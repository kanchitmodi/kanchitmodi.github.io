import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";

export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { viewer } = await requireApiAuth();
    const { id } = await ctx.params;
    const r = await db.categoryRule.deleteMany({
      where: {
        id,
        householdId: viewer.householdId,
        OR: [{ isPrivate: false }, { createdById: viewer.userId }],
      },
    });
    if (r.count === 0) throw new ApiError(404, "not_found");
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "rule.delete",
      entityType: "rule",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  },
);
