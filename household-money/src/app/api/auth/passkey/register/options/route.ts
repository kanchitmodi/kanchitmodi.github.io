import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { registrationOptions } from "@/lib/passkeys";

export const POST = apiHandler(async () => {
  const { user, session } = await requireApiAuth();
  const full = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { passkeys: true },
  });
  const options = await registrationOptions(full);
  await db.session.update({ where: { id: session.id }, data: { challenge: options.challenge } });
  return NextResponse.json(options);
});
