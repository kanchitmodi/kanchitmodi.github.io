import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/auth-guard";
import { destroySession, readSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export const POST = apiHandler(async () => {
  const r = await readSession();
  if (r?.session.user.membership) {
    await audit({
      householdId: r.session.user.membership.householdId,
      actorUserId: r.session.userId,
      action: "auth.logout",
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
});
