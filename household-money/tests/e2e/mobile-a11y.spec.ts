import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("iPhone gets a bottom tab bar with 44px+ targets; desktop gets a sidebar", async ({
  page,
  isMobile,
}) => {
  await login(page, "kanchit");
  if (isMobile) {
    await expect(page.getByTestId("bottom-tabs")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    for (const link of await page.getByTestId("bottom-tabs").getByRole("link").all()) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId("bottom-tabs").getByRole("link", { name: "Accounts" }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } else {
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("bottom-tabs")).toBeHidden();
  }
});

const PAGES = [
  "/",
  "/transactions",
  "/accounts",
  "/settings",
  "/settings/setup",
  "/settings/household",
  "/settings/security",
  "/settings/connections",
  "/settings/audit",
];

test("no serious accessibility violations (axe), light and dark", async ({ page }) => {
  const check = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      bad.map(
        (v) =>
          `${label}: ${v.id} — ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(", ")}`,
      ),
    ).toEqual([]);
  };
  await page.goto("/login");
  await check("/login");
  await login(page, "kanchit");
  for (const path of PAGES) {
    await page.goto(path);
    await check(path);
  }
  await page.evaluate(() => localStorage.setItem("hm_theme", "dark"));
  for (const path of ["/", "/accounts", "/settings/setup"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await check(`${path} (dark)`);
  }
});
