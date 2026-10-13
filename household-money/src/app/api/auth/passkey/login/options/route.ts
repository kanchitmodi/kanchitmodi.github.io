import { secureCookies } from "@/lib/env";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { apiHandler } from "@/lib/auth-guard";
import { authenticationOptions } from "@/lib/passkeys";

export const POST = apiHandler(async () => {
  const options = await authenticationOptions();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const ch = await db.authChallenge.create({ data: { challenge: options.challenge, expiresAt } });
  (await cookies()).set("hm_pk_chal", ch.id, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    path: "/api/auth/passkey",
    expires: expiresAt,
  });
  return NextResponse.json(options);
});
