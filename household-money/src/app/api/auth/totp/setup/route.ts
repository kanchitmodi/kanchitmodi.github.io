import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { encrypt } from "@/lib/crypto";
import { newTotpSecret, totpUri } from "@/lib/totp";
import { readSession } from "@/lib/session";

/** Start TOTP enrollment. Only for users without TOTP yet (prevents a password-only takeover of 2FA). */
export const POST = apiHandler(async () => {
  const r = await readSession();
  if (!r) throw new ApiError(401, "anonymous");
  const user = r.session.user;
  if (user.totpEnabled) throw new ApiError(409, "totp_already_enabled");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret) } });
  const uri = totpUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return NextResponse.json({ secret, uri, qr });
});
