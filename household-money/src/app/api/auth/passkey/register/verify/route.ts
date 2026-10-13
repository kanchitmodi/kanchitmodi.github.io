import { NextResponse } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { verifyRegistration } from "@/lib/passkeys";
import { audit } from "@/lib/audit";

const Body = z.object({
  response: z.record(z.string(), z.unknown()),
  deviceName: z.string().max(60).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const { user, session, viewer } = await requireApiAuth();
  const body = await parseBody(req, Body);
  if (!session.challenge) throw new ApiError(400, "no_challenge");
  await db.session.update({ where: { id: session.id }, data: { challenge: null } });
  let cred;
  try {
    cred = await verifyRegistration(
      body.response as unknown as RegistrationResponseJSON,
      session.challenge,
    );
  } catch (e) {
    throw new ApiError(
      400,
      "passkey_invalid",
      e instanceof Error ? e.message : "Verification failed",
    );
  }
  if (!cred) throw new ApiError(400, "passkey_invalid");
  const pk = await db.passkey.create({
    data: {
      userId: user.id,
      credentialId: cred.id,
      publicKey: Buffer.from(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ?? [],
      deviceName: body.deviceName?.trim() || "Passkey",
    },
  });
  await audit({
    householdId: viewer.householdId,
    actorUserId: user.id,
    action: "auth.passkey_added",
    entityType: "passkey",
    entityId: pk.id,
  });
  return NextResponse.json({ ok: true, id: pk.id });
});
