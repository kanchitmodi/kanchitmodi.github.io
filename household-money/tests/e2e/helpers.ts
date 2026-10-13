import { expect, type Page, type BrowserContext } from "@playwright/test";
import { authenticator } from "otplib";
import { DEMO_PASSWORD, DEMO_USERS } from "../../src/lib/demo/seed";

export type Who = "kanchit" | "wife";

export async function login(page: Page, who: Who) {
  const u = DEMO_USERS[who];
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/login/2fa");
  await page.getByLabel("Authentication code").fill(authenticator.generate(u.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("kpi-networth")).toBeVisible();
}

export async function setView(page: Page, label: string) {
  const radio = page.getByTestId("scope-switcher").getByRole("radio", { name: label });
  await radio.click();
  await expect(radio).toHaveAttribute("aria-checked", "true");
  await page.waitForLoadState("networkidle");
}

export async function apiGet(context: BrowserContext, path: string) {
  const res = await context.request.get(path);
  return { status: res.status(), json: await res.json() };
}
