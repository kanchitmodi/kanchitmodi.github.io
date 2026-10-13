import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { getTransactionDetail, TxnError, updateTransaction } from "@/lib/txn-service";

function mapErr(e: unknown): never {
  if (e instanceof TxnError)
    throw new ApiError(e.code === "not_found" ? 404 : 400, e.code, e.message);
  throw e;
}

export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getTransactionDetail(db, viewer, id));
  } catch (e) {
    mapErr(e);
  }
});

const Body = z.object({
  categoryId: z.string().max(40).nullable().optional(),
  applyToMerchant: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isTransfer: z.boolean().optional(),
});

export const PATCH = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  try {
    return NextResponse.json(await updateTransaction(db, viewer, id, body));
  } catch (e) {
    mapErr(e);
  }
});
