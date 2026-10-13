import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { audit } from "@/lib/audit";

/** Built-in categories the app logic depends on: can be recoloured, not renamed or deleted. */
const PROTECTED = new Set(["Transfers", "Income", "Other"]);

const Body = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
});

export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const b = await parseBody(req, Body);
  const cat = await db.category.findFirst({ where: { id, householdId: viewer.householdId } });
  if (!cat) throw new ApiError(404, "not_found");
  if (PROTECTED.has(cat.name) && (b.name !== undefined || b.kind !== undefined))
    throw new ApiError(400, "protected", `${cat.name} can't be renamed.`);
  try {
    const c = await db.category.update({ where: { id }, data: b });
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "category.edit",
      entityType: "category",
      entityId: id,
      details: { op: "update", ...b },
    });
    return NextResponse.json({ category: c });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ApiError(409, "duplicate", "A category with that name exists.");
    throw e;
  }
});

/** Delete a category: its transactions, splits and rules move to "Other". */
export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { viewer } = await requireApiAuth();
    const { id } = await ctx.params;
    const cat = await db.category.findFirst({ where: { id, householdId: viewer.householdId } });
    if (!cat) throw new ApiError(404, "not_found");
    if (PROTECTED.has(cat.name))
      throw new ApiError(400, "protected", `${cat.name} can't be deleted.`);
    const other = await db.category.findFirst({
      where: { householdId: viewer.householdId, name: "Other" },
    });
    await db.$transaction([
      db.transaction.updateMany({
        where: { categoryId: id },
        data: { categoryId: other?.id ?? null },
      }),
      db.transactionSplit.updateMany({
        where: { categoryId: id },
        data: { categoryId: other?.id ?? null },
      }),
      ...(other
        ? [
            db.categoryRule.updateMany({
              where: { categoryId: id },
              data: { categoryId: other.id },
            }),
          ]
        : []),
      db.category.delete({ where: { id } }),
    ]);
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "category.edit",
      entityType: "category",
      entityId: id,
      details: { op: "delete", name: cat.name },
    });
    return NextResponse.json({ ok: true });
  },
);
