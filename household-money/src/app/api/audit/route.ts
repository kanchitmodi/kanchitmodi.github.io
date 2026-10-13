import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";

/** Audit log is visible to both household members. */
export const GET = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  const rows = await db.auditLog.findMany({
    where: { householdId: viewer.householdId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actor?.name ?? "System",
      action: r.action,
      entityType: r.entityType,
      details: r.details,
    })),
  });
});
