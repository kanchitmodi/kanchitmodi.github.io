import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { discardImport, ImportError } from "@/lib/import/service";

export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { viewer } = await requireApiAuth();
    const { id } = await ctx.params;
    try {
      await discardImport(db, viewer, id);
    } catch (e) {
      if (e instanceof ImportError) throw new ApiError(404, e.code);
      throw e;
    }
    return NextResponse.json({ ok: true });
  },
);
