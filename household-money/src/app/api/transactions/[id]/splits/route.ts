import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { setSplits, TxnError } from "@/lib/txn-service";

const Body = z.object({
  splits: z
    .array(
      z.object({
        categoryId: z.string().max(40).nullable(),
        amountCents: z.number().int(),
        note: z.string().max(200).nullable().optional(),
      }),
    )
    .max(20),
});

export const PUT = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const { splits } = await parseBody(req, Body);
  try {
    await setSplits(db, viewer, id, splits);
  } catch (e) {
    if (e instanceof TxnError)
      throw new ApiError(e.code === "not_found" ? 404 : 400, e.code, e.message);
    throw e;
  }
  return NextResponse.json({ ok: true });
});
