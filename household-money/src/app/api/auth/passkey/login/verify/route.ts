import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { verifyAuthentication } from "@/lib/passkeys";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ response: z.record(z.string(), z.unknown()) });

/** Passkey (Face ID / Touch ID) sign-in: possession + biometric satisfies MFA on its own. */
export const POST = apiHandler(async (req: Request) => {
  const { response } = await parseBody(req, Body);
  const jar = await cookies();
  const chId = jar.get("hm_pk_chal")?.value;
  if (!chId) throw new ApiError(400, "no_challenge");
  const ch = await db.authChallenge.findUnique({ where: { id: chId } });
  await db.authChallenge.deleteMany({ where: { id: chId } });
  jar.set("hm_pk_chal", "", { path: "/api/auth/passkey", maxAge: 0 });
  if (!ch || ch.expiresAt < new Date()) throw new ApiError(400, "challenge_expired");

  let passkey;
  try {
    passkey = await verifyAuthentication(
      response as unknown as AuthenticationResponseJSON,
      ch.challenge,
    );
  } catch {
    passkey = null;
  }
  if (!passkey) throw new ApiError(401, "passkey_invalid", "Passkey not recognised.");
  const user = await db.user.findUniqueOrThrow({
    where: { id: passkey.userId },
    include: { membership: true },
  });
  if (!user.totpEnabled) throw new ApiError(403, "totp_not_enrolled");
  await createSession(user.id, true);
  if (user.membership) {
    await audit({
      householdId: user.membership.householdId,
      actorUserId: user.id,
      action: "auth.login",
      details: { method: "passkey" },
    });
  }
  return NextResponse.json({ ok: true, next: "/" });
});
