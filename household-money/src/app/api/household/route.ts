import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { canManageHousehold } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const Body = z.object({
  name: z.string().min(1).max(80).optional(),
  jointSplitPct: z.number().int().min(0).max(100).optional(),
});

export const PATCH = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  if (!canManageHousehold(viewer))
    throw new ApiError(403, "forbidden", "Only the household owner can change settings.");
  const body = await parseBody(req, Body);
  const h = await db.household.update({ where: { id: viewer.householdId }, data: body });
  await audit({
    householdId: viewer.householdId,
    actorUserId: viewer.userId,
    action: "household.settings",
    details: body,
  });
  return NextResponse.json({
    household: { id: h.id, name: h.name, jointSplitPct: h.jointSplitPct },
  });
});
