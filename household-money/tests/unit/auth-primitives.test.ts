import { describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import { currentTotp, newTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { IDLE_LOCK_MS, sessionState, shouldTouch } from "@/lib/session-state";
import { isLimited, MAX_FAILURES_PER_EMAIL } from "@/lib/rate-limit";

describe("TOTP", () => {
  it("accepts the current code and rejects others", () => {
    const secret = newTotpSecret();
    expect(verifyTotp(currentTotp(secret), secret)).toBe(true);
    expect(verifyTotp("000000", secret) && currentTotp(secret) !== "000000").toBe(false);
    expect(verifyTotp("12345", secret)).toBe(false);
    expect(verifyTotp("abcdef", secret)).toBe(false);
  });
  it("tolerates spaces", () => {
    const secret = newTotpSecret();
    const c = currentTotp(secret);
    expect(verifyTotp(`${c.slice(0, 3)} ${c.slice(3)}`, secret)).toBe(true);
  });
  it("builds an otpauth URI with issuer", () => {
    expect(totpUri("a@b.c", "JBSWY3DPEHPK3PXP")).toMatch(
      /^otpauth:\/\/totp\/Household%20Money:a%40b\.c\?secret=JBSWY3DPEHPK3PXP/,
    );
  });
  it("allows one step of clock drift", () => {
    const secret = newTotpSecret();
    const prev = authenticator.clone({ epoch: Date.now() - 30_000 }).generate(secret);
    expect(verifyTotp(prev, secret)).toBe(true);
  });
});

describe("passwords", () => {
  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("long-enough-pw")).toBeNull();
  });
  it("hashes with bcrypt", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("session state (auto-lock after 5 min idle)", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const base = { mfaPassed: true, expiresAt: new Date("2026-11-01T00:00:00Z"), lastActiveAt: now };
  it("is active right after activity", () => expect(sessionState(base, now)).toBe("active"));
  it("is still active at exactly 5 minutes", () =>
    expect(
      sessionState({ ...base, lastActiveAt: new Date(now.getTime() - IDLE_LOCK_MS) }, now),
    ).toBe("active"));
  it("locks after 5 minutes idle", () =>
    expect(
      sessionState({ ...base, lastActiveAt: new Date(now.getTime() - IDLE_LOCK_MS - 1) }, now),
    ).toBe("locked"));
  it("requires MFA before anything else", () =>
    expect(sessionState({ ...base, mfaPassed: false, lastActiveAt: new Date(0) }, now)).toBe(
      "mfa_pending",
    ));
  it("expires", () => expect(sessionState({ ...base, expiresAt: now }, now)).toBe("expired"));
  it("throttles activity writes", () => {
    expect(shouldTouch({ lastActiveAt: new Date(now.getTime() - 10_000) }, now)).toBe(false);
    expect(shouldTouch({ lastActiveAt: new Date(now.getTime() - 31_000) }, now)).toBe(true);
  });
});

describe("login rate limit", () => {
  it("blocks at the limit", () => {
    expect(isLimited(MAX_FAILURES_PER_EMAIL - 1, MAX_FAILURES_PER_EMAIL)).toBe(false);
    expect(isLimited(MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_EMAIL)).toBe(true);
  });
});
