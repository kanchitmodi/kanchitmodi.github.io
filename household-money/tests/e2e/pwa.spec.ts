import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("manifest is installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Household Money", display: "standalone", start_url: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
});

test("iOS meta tags and safe-area viewport are present", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  await expect(
    page
      .locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')
      .first(),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /apple-touch-icon/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("service worker serves last-synced data offline", async ({
  page,
  context,
  browserName,
}, info) => {
  test.skip(
    browserName !== "chromium" || info.project.name !== "desktop-chrome",
    "offline emulation checked once",
  );
  await login(page, "kanchit");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByTestId("kpi-networth")).toBeVisible();
  const value = await page.getByTestId("kpi-networth").textContent();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("kpi-networth")).toHaveText(value!);
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
  await context.setOffline(false);
});

test("security headers are set", async ({ request }) => {
  const h = (await request.get("/login")).headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age");
  expect(h["x-powered-by"]).toBeUndefined();
});
