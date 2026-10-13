import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { authenticationOptions } from "@/lib/passkeys";
import { readSession } from "@/lib/session";

export const POST = apiHandler(async () => {
  const r = await readSession();
  if (!r || r.state === "mfa_pending") throw new ApiError(401, r ? "mfa_pending" : "anonymous");
  const passkeys = await db.passkey.findMany({ where: { userId: r.session.userId } });
  if (passkeys.length === 0) throw new ApiError(400, "no_passkeys");
  const options = await authenticationOptions(passkeys);
  await db.session.update({ where: { id: r.session.id }, data: { challenge: options.challenge } });
  return NextResponse.json(options);
});
