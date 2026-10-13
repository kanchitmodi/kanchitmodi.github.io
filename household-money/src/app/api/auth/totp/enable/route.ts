import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { decrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { readSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ code: z.string().max(12) });

export const POST = apiHandler(async (req: Request) => {
  const { code } = await parseBody(req, Body);
  const r = await readSession();
  if (!r) throw new ApiError(401, "anonymous");
  const user = r.session.user;
  if (user.totpEnabled) throw new ApiError(409, "totp_already_enabled");
  if (!user.totpSecretEnc) throw new ApiError(400, "totp_setup_not_started");
  if (!verifyTotp(code, decrypt(user.totpSecretEnc))) {
    throw new ApiError(401, "invalid_code", "That code didn't match. Try the newest code.");
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpEnabled: true } }),
    db.session.update({
      where: { id: r.session.id },
      data: { mfaPassed: true, lastActiveAt: new Date() },
    }),
  ]);
  if (user.membership) {
    await audit({
      householdId: user.membership.householdId,
      actorUserId: user.id,
      action: "auth.totp_enabled",
    });
  }
  return NextResponse.json({ ok: true, next: "/settings/security?welcome=1" });
});
