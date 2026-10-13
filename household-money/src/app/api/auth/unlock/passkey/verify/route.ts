import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { verifyAuthentication } from "@/lib/passkeys";
import { readSession } from "@/lib/session";
import { audit } from "@/lib/audit";

const Body = z.object({ response: z.record(z.string(), z.unknown()) });

export const POST = apiHandler(async (req: Request) => {
  const { response } = await parseBody(req, Body);
  const r = await readSession();
  if (!r || r.state === "mfa_pending") throw new ApiError(401, r ? "mfa_pending" : "anonymous");
  const challenge = r.session.challenge;
  if (!challenge) throw new ApiError(400, "no_challenge");
  await db.session.update({ where: { id: r.session.id }, data: { challenge: null } });
  let passkey;
  try {
    passkey = await verifyAuthentication(
      response as unknown as AuthenticationResponseJSON,
      challenge,
    );
  } catch {
    passkey = null;
  }
  if (!passkey || passkey.userId !== r.session.userId) throw new ApiError(401, "passkey_invalid");
  await db.session.update({ where: { id: r.session.id }, data: { lastActiveAt: new Date() } });
  if (r.session.user.membership) {
    await audit({
      householdId: r.session.user.membership.householdId,
      actorUserId: r.session.userId,
      action: "auth.unlock",
      details: { method: "passkey" },
    });
  }
  return NextResponse.json({ ok: true });
});
