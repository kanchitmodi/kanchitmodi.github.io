import { readFileSync, existsSync } from "node:fs";
import { vi } from "vitest";

// Load .env for local runs (CI sets env vars directly).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
(process.env as Record<string, string>).NODE_ENV = "test";
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
}
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

// `server-only` throws outside React Server Components; it's a no-op for tests.
vi.mock("server-only", () => ({}));
