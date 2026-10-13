import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { decrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { loginBlocked, recordAttempt } from "@/lib/rate-limit";
import { readSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ code: z.string().max(12) });

/** Second factor for a password-authenticated session. */
export const POST = apiHandler(async (req: Request) => {
  const { code } = await parseBody(req, Body);
  const r = await readSession();
  if (!r) throw new ApiError(401, "anonymous");
  const { session } = r;
  const user = session.user;
  if (r.state !== "mfa_pending") return NextResponse.json({ ok: true, next: "/" });
  if (!user.totpEnabled || !user.totpSecretEnc) throw new ApiError(400, "totp_not_enrolled");

  const key = `totp-${user.id}`;
  if (await loginBlocked(key, key))
    throw new ApiError(429, "rate_limited", "Too many attempts. Try again in 15 minutes.");
  const ok = verifyTotp(code, decrypt(user.totpSecretEnc));
  await recordAttempt(key, key, ok);
  if (!ok)
    throw new ApiError(
      401,
      "invalid_code",
      "That code didn't work. Check the time on your phone and try again.",
    );

  await db.session.update({
    where: { id: session.id },
    data: { mfaPassed: true, lastActiveAt: new Date() },
  });
  if (user.membership) {
    await audit({
      householdId: user.membership.householdId,
      actorUserId: user.id,
      action: "auth.login",
      details: { method: "password+totp" },
    });
  }
  return NextResponse.json({ ok: true, next: "/" });
});
