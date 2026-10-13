import { NextResponse } from "next/server";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { listTransactions } from "@/lib/data";
import { scopeForRequest } from "@/lib/scope-server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const { scope } = await scopeForRequest(req, viewer);
  const p = new URL(req.url).searchParams;
  const from = p.get("from") ?? undefined;
  const to = p.get("to") ?? undefined;
  const txns = await listTransactions(viewer, scope, {
    q: p.get("q")?.slice(0, 100) || undefined,
    accountId: p.get("accountId") ?? undefined,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    limit: Number(p.get("limit")) || 100,
    cursor: p.get("cursor") ?? undefined,
  });
  return NextResponse.json({ transactions: txns });
});
