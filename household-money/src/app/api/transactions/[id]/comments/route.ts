import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { addComment, TxnError } from "@/lib/txn-service";

const Body = z.object({ body: z.string().max(1000) });

export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const { body } = await parseBody(req, Body);
  try {
    const c = await addComment(db, viewer, id, body);
    return NextResponse.json({ id: c.id }, { status: 201 });
  } catch (e) {
    if (e instanceof TxnError)
      throw new ApiError(e.code === "not_found" ? 404 : 400, e.code, e.message);
    throw e;
  }
});
