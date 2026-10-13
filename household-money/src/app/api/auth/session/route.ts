import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/auth-guard";
import { readSession } from "@/lib/session";

export const GET = apiHandler(async () => {
  const r = await readSession();
  return NextResponse.json({ state: r?.state ?? "anonymous" });
});
