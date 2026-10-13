import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("AES-256-GCM token encryption", () => {
  it("round-trips", () => {
    const c = encrypt("plaid-access-sandbox-123", key);
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain("plaid-access");
    expect(decrypt(c, key)).toBe("plaid-access-sandbox-123");
  });
  it("uses a fresh IV every time", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });
  it("rejects tampering", () => {
    const c = encrypt("secret", key);
    const parts = c.split(".");
    parts[3] = Buffer.from("evil").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });
  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("secret", key), randomBytes(32).toString("base64"))).toThrow();
  });
  it("rejects keys that are not 32 bytes", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
  it("hashes and compares tokens", () => {
    expect(sha256("a")).toHaveLength(64);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
