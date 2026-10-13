import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/auth-guard";
import { lockSession, readSession } from "@/lib/session";

export const POST = apiHandler(async () => {
  const r = await readSession();
  if (r) await lockSession(r.session.id);
  return NextResponse.json({ ok: true });
});
