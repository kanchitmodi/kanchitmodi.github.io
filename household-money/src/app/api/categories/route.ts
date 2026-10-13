import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";

export const GET = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  const categories = await db.category.findMany({
    where: { householdId: viewer.householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ categories: categories.map(({ householdId: _h, ...c }) => c) });
});

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).default("EXPENSE"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#78716c"),
});

export const POST = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const b = await parseBody(req, Body);
  try {
    const max = await db.category.aggregate({
      where: { householdId: viewer.householdId },
      _max: { sortOrder: true },
    });
    const c = await db.category.create({
      data: { householdId: viewer.householdId, ...b, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "category.edit",
      entityType: "category",
      entityId: c.id,
      details: { op: "create", name: c.name },
    });
    return NextResponse.json({ category: c }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ApiError(409, "duplicate", "A category with that name exists.");
    throw e;
  }
});
