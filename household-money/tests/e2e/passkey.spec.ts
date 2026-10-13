import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** Passkey (Face ID) registration, unlock and sign-in, via Chromium's virtual WebAuthn authenticator. */
test("register a passkey, then unlock and sign in with it", async ({
  page,
  context,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium" || info.project.name !== "desktop-chrome",
    "CDP virtual authenticator is Chromium-only",
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await login(page, "wife");
  await page.goto("/settings/security");
  await page.getByLabel("Device name").fill("Test iPhone");
  await page.getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByTestId("passkey-list")).toContainText("Test iPhone");

  await page.request.post("/api/auth/lock");
  await page.goto("/lock");
  await page.getByRole("button", { name: "Use Face ID / passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Use Face ID / passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByTestId("kpi-networth")).toBeVisible();

  await page.goto("/settings/security");
  await page.getByTestId("passkey-list").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("passkey-list")).toContainText("No passkeys yet");
});
