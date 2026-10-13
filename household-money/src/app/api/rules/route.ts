import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";

/** Learned rules. Private rules (from private accounts) are listed only for their creator. */
export const GET = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  const rules = await db.categoryRule.findMany({
    where: {
      householdId: viewer.householdId,
      OR: [{ isPrivate: false }, { createdById: viewer.userId }],
    },
    include: { category: true, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      match: r.match,
      category: r.category.name,
      isPrivate: r.isPrivate,
      createdBy: r.createdBy?.name ?? null,
      hits: r.hits,
    })),
  });
});
