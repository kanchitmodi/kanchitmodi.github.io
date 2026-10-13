import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { accountAccess, canChangeVisibility } from "@/lib/permissions";
import { canImportInto } from "@/lib/import/service";
import { toAccountView } from "@/lib/data";
import { audit } from "@/lib/audit";

const Body = z.object({
  visibility: z.enum(["SHARED", "PRIVATE"]).optional(),
  privateMode: z.enum(["BALANCE_ONLY", "HIDDEN"]).optional(),
  /** Manual accounts only: current balance in cents (cards owed = negative) */
  balanceCents: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  const account = await db.account.findUnique({ where: { id } });
  // Same 404 for "doesn't exist" and "can't see it" so hidden accounts can't be probed.
  if (!account || accountAccess(viewer, account) === "none") throw new ApiError(404, "not_found");

  if (body.visibility !== undefined || body.privateMode !== undefined) {
    if (!canChangeVisibility(viewer, account))
      throw new ApiError(403, "forbidden", "Only the account owner can change visibility.");
  }
  if (body.balanceCents !== undefined || body.name !== undefined) {
    if (!canImportInto(viewer, account))
      throw new ApiError(403, "forbidden", "Only the account owner can edit this account.");
    if (body.balanceCents !== undefined && account.connectionMode !== "MANUAL") {
      throw new ApiError(400, "not_manual", "Balances of connected accounts come from the bank.");
    }
  }
  const updated = await db.account.update({
    where: { id },
    data: { ...body, ...(body.balanceCents !== undefined ? { balanceUpdatedAt: new Date() } : {}) },
  });
  if (body.visibility !== undefined || body.privateMode !== undefined) {
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
  }
  if (body.balanceCents !== undefined) {
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "account.balance",
      entityType: "account",
      entityId: id,
    });
  }
  return NextResponse.json({ account: toAccountView(viewer, updated, "full") });
});
