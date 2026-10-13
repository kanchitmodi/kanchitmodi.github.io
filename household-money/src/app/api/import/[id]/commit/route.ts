import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { commitImport, ImportError } from "@/lib/import/service";

const Body = z.object({
  accountId: z.string().max(40),
  exclude: z.array(z.number().int().min(0)).max(20000).optional(),
});

export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  try {
    return NextResponse.json(
      await commitImport(db, viewer, {
        batchId: id,
        accountId: body.accountId,
        exclude: body.exclude,
      }),
    );
  } catch (e) {
    if (e instanceof ImportError)
      throw new ApiError(
        e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400,
        e.code,
        e.message,
      );
    throw e;
  }
});
