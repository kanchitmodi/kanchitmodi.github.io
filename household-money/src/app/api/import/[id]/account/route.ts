import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { ImportError, previewForAccount } from "@/lib/import/service";

const Body = z.object({ accountId: z.string().max(40) });

/** Re-run the preview (dedupe + category guesses) against a different target account. */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { viewer } = await requireApiAuth();
  const { id } = await ctx.params;
  const { accountId } = await parseBody(req, Body);
  try {
    return NextResponse.json({ rows: await previewForAccount(db, viewer, id, accountId) });
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
