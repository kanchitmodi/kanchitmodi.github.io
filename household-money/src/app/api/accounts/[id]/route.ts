import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { accountAccess, canChangeVisibility } from "@/lib/permissions";
import { toAccountView } from "@/lib/data";
import { audit } from "@/lib/audit";

const Body = z.object({
  visibility: z.enum(["SHARED", "PRIVATE"]).optional(),
  privateMode: z.enum(["BALANCE_ONLY", "HIDDEN"]).optional(),
});

export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  const account = await db.account.findUnique({ where: { id } });
  // Same 404 for "doesn't exist" and "can't see it" so hidden accounts can't be probed.
  if (!account || accountAccess(viewer, account) === "none") throw new ApiError(404, "not_found");
  if (!canChangeVisibility(viewer, account))
    throw new ApiError(403, "forbidden", "Only the account owner can change visibility.");
  const updated = await db.account.update({ where: { id }, data: body });
  await audit({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: "account.visibility",
    entityType: "account",
    entityId: id,
    details: {
      from: { visibility: account.visibility, privateMode: account.privateMode },
      to: { visibility: updated.visibility, privateMode: updated.privateMode },
    },
  });
  return NextResponse.json({ account: toAccountView(viewer, updated, "full") });
});
