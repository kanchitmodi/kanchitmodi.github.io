import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Passkey, User } from "@prisma/client";
import { db } from "./db";
import { RP_NAME, rp } from "./webauthn";

export async function registrationOptions(user: User & { passkeys: Passkey[] }) {
  const { rpID } = rp();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!v.verified || !v.registrationInfo) return null;
  return v.registrationInfo.credential;
}

export async function authenticationOptions(allow?: Passkey[]) {
  const { rpID } = rp();
  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: allow?.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
  });
}

/** Verify an assertion; returns the matching passkey (with updated counter) or null. */
export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
): Promise<Passkey | null> {
  const passkey = await db.passkey.findUnique({ where: { credentialId: response.id } });
  if (!passkey) return null;
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
  });
  if (!v.verified) return null;
  return db.passkey.update({
    where: { id: passkey.id },
    data: { counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
}
