import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";

/**
 * Full first-run flow on a brand-new household: owner signs up, enrolls TOTP, invites a member,
 * member accepts the emailed link, enrolls TOTP, and both see one shared household.
 * Runs once (desktop) because bootstrap sign-up closes after the first real household.
 */
test("bootstrap signup → TOTP → invite → member joins", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "single-run flow");
  const stamp = Date.now();
  const owner = await browser.newContext();
  const op = await owner.newPage();
  await op.goto("/signup");
  await op.getByLabel("Your name").fill("Owner");
  await op.getByLabel("Email").fill(`owner-${stamp}@example.com`);
  await op.getByLabel("Password (10+ characters)").fill("owner-password-1");
  await op.getByLabel("Confirm password").fill("owner-password-1");
  await op.getByRole("button", { name: "Create account" }).click();
  await op.waitForURL("**/enroll");
  expect((await owner.request.get("/api/accounts")).status()).toBe(401);
  await op.getByText("Can't scan?").click();
  const secret = (await op.getByTestId("totp-secret").textContent())!.trim();
  await op.getByLabel("6-digit code").fill(authenticator.generate(secret));
  await op.getByRole("button", { name: "Turn on 2-factor" }).click();
  await op.waitForURL("**/settings/security?welcome=1");

  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  await sp.goto("/signup");
  await expect(sp.getByText("invite-only")).toBeVisible();

  await op.goto("/settings/household");
  await op.getByLabel("Email").fill(`member-${stamp}@example.com`);
  await op.getByRole("button", { name: "Send invite" }).click();
  const link = (await op.getByTestId("invite-link").textContent())!.trim();

  const member = await browser.newContext();
  const mp = await member.newPage();
  await mp.goto(link);
  await expect(mp.getByRole("heading", { name: /Join/ })).toBeVisible();
  await expect(mp.getByLabel("Email")).toHaveValue(`member-${stamp}@example.com`);
  await mp.getByLabel("Your name").fill("Member");
  await mp.getByLabel("Password (10+ characters)").fill("member-password-1");
  await mp.getByLabel("Confirm password").fill("member-password-1");
  await mp.getByRole("button", { name: "Create account" }).click();
  await mp.waitForURL("**/enroll");
  await mp.getByText("Can't scan?").click();
  const ms = (await mp.getByTestId("totp-secret").textContent())!.trim();
  await mp.getByLabel("6-digit code").fill(authenticator.generate(ms));
  await mp.getByRole("button", { name: "Turn on 2-factor" }).click();
  await mp.waitForURL("**/settings/security?welcome=1");

  await mp.goto("/settings/household");
  await expect(mp.getByTestId("members")).toContainText("Owner");
  await expect(mp.getByTestId("members")).toContainText("Member (you)");
  await expect(mp.getByTestId("scope-switcher")).toContainText("Owner");

  const again = await browser.newContext();
  const ap = await again.newPage();
  await ap.goto(link);
  await expect(ap.getByText("invalid or has expired")).toBeVisible();
  await Promise.all([owner.close(), member.close(), stranger.close(), again.close()]);
});
