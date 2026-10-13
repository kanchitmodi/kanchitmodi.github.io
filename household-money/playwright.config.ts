import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// Load .env for local runs (CI sets env vars directly).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const DB = process.env.E2E_DATABASE_URL ?? "";
// Real WebKit (iPhone Safari engine) in CI; locally, if WebKit isn't installed, emulate the
// iPhone viewport/touch/UA in Chromium with PW_IPHONE_BROWSER=chromium.
const iphoneBrowser = (process.env.PW_IPHONE_BROWSER ??
  (process.env.CI ? "webkit" : "chromium")) as "webkit" | "chromium";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 14"], browserName: iphoneBrowser } },
  ],
  webServer: {
    command: process.env.E2E_DEV
      ? `npx next dev -p ${PORT}`
      : `npx next build && npx next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: DB,
      DIRECT_URL: DB,
      APP_URL: BASE,
      DEMO_MODE: "true",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
      RESEND_API_KEY: "",
      PLAID_CLIENT_ID: "",
      PLAID_SECRET: "",
    },
  },
});
