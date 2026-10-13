import { NextResponse } from "next/server";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { listAccounts } from "@/lib/data";
import { scopeForRequest } from "@/lib/scope-server";

export const GET = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const { scope } = await scopeForRequest(req, viewer);
  return NextResponse.json({ accounts: await listAccounts(viewer, scope) });
});
