import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { loginBlocked, recordAttempt } from "@/lib/rate-limit";
import { clientIp, readSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ password: z.string().max(200) });

/** Unlock an idle-locked session with the account password. */
export const POST = apiHandler(async (req: Request) => {
  const { password } = await parseBody(req, Body);
  const r = await readSession();
  if (!r) throw new ApiError(401, "anonymous");
  if (r.state === "mfa_pending") throw new ApiError(401, "mfa_pending");
  const user = r.session.user;
  const ip = await clientIp();
  if (await loginBlocked(user.email, ip))
    throw new ApiError(429, "rate_limited", "Too many attempts. Try again in 15 minutes.");
  const ok = await verifyPassword(password, user.passwordHash);
  await recordAttempt(user.email, ip, ok);
  if (!ok) throw new ApiError(401, "invalid_credentials", "Incorrect password.");
  await db.session.update({ where: { id: r.session.id }, data: { lastActiveAt: new Date() } });
  if (user.membership) {
    await audit({
      householdId: user.membership.householdId,
      actorUserId: user.id,
      action: "auth.unlock",
      details: { method: "password" },
    });
  }
  return NextResponse.json({ ok: true });
});
