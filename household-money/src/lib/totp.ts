import { authenticator } from "otplib";

// RFC 6238 defaults (30s, 6 digits, SHA-1) — what iOS Passwords / Google Authenticator / 1Password expect.
authenticator.options = { window: 1 };

export const TOTP_ISSUER = "Household Money";

export function newTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

export function verifyTotp(code: string, secret: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return authenticator.check(clean, secret);
}

export function currentTotp(secret: string): string {
  return authenticator.generate(secret);
}
