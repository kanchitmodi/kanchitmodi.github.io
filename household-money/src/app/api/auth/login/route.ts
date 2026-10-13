import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { normalizeEmail } from "@/lib/auth-service";
import { dummyHash, verifyPassword } from "@/lib/password";
import { loginBlocked, recordAttempt } from "@/lib/rate-limit";
import { clientIp, createSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });

export const POST = apiHandler(async (req: Request) => {
  const { email: rawEmail, password } = await parseBody(req, Body);
  const email = normalizeEmail(rawEmail);
  const ip = await clientIp();
  if (await loginBlocked(email, ip))
    throw new ApiError(429, "rate_limited", "Too many attempts. Try again in 15 minutes.");

  const user = await db.user.findUnique({ where: { email }, include: { membership: true } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  await recordAttempt(email, ip, ok && !!user);
  if (!user || !ok) {
    if (user?.membership) {
      await audit({
        householdId: user.membership.householdId,
        actorUserId: user.id,
        action: "auth.login_failed",
      });
    }
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");
  }
  await createSession(user.id, false);
  return NextResponse.json({ ok: true, next: user.totpEnabled ? "/login/2fa" : "/enroll" });
});
