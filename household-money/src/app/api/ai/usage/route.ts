import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { aiBudget } from "@/lib/ai/claude";

export const GET = apiHandler(async () => {
  const { viewer } = await requireApiAuth();
  return NextResponse.json(await aiBudget(db, viewer.householdId));
});
