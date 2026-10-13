import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("unauthenticated users are sent to login; API returns 401", async ({ page, request }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get("/api/accounts")).status()).toBe(401);
});

test("login requires password + TOTP and lands on the dashboard", async ({ page }) => {
  await login(page, "kanchit");
  await expect(page.getByRole("heading", { name: "Household", level: 1 })).toBeVisible();
  await expect(page.getByTestId("kpi-spend")).toContainText("$");
});

test("a password alone does not grant access", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("kanchit@demo.local");
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/login/2fa");
  expect((await context.request.get("/api/accounts")).status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/2fa$/);
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("didn't work");
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@demo.local");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("incorrect");
});

test("auto-locks after 5 minutes idle and unlocks with password", async ({ page, context }) => {
  await page.clock.install();
  await login(page, "wife");
  await page.clock.fastForward("05:30");
  await page.waitForURL("**/lock");
  expect((await context.request.get("/api/accounts")).status()).toBe(401);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect((await context.request.get("/api/accounts")).status()).toBe(200);
});

test("sign out ends the session", async ({ page, context }) => {
  await login(page, "kanchit");
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  expect((await context.request.get("/api/accounts")).status()).toBe(401);
});
