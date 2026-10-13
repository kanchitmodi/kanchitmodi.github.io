import { expect, test } from "@playwright/test";
import { apiGet, login, setView } from "./helpers";

test("household switcher filters every screen by person", async ({ page }) => {
  await login(page, "kanchit");
  await setView(page, "Wife");
  await expect(page.getByRole("heading", { name: "Wife", level: 1 })).toBeVisible();
  await page.goto("/transactions");
  const rows = page.getByTestId("txn-row");
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) {
    expect(text).toContain("· Wife");
    expect(text).not.toContain("· Kanchit");
  }
  await setView(page, "Household");
});

test("Wife never sees Kanchit's hidden private account — UI and API", async ({ page, context }) => {
  await login(page, "wife");
  await page.goto("/accounts");
  await expect(page.getByTestId("account-row").first()).toBeVisible();
  await expect(page.getByText("CIBC Credit Card")).toHaveCount(0);

  const { json } = await apiGet(context, "/api/accounts");
  expect(json.accounts.map((a: { name: string }) => a.name)).not.toContain("CIBC Credit Card");
  const tx = await apiGet(context, "/api/transactions?limit=500&q=Air%20Canada");
  expect(tx.json.transactions).toEqual([]);
  await page.goto("/transactions?q=Air+Canada");
  await expect(page.getByText("No matching transactions.")).toBeVisible();
});

test("Kanchit sees Wife's balance-only private card as a redacted balance", async ({
  page,
  context,
}) => {
  await login(page, "kanchit");
  const { json } = await apiGet(context, "/api/accounts");
  const priv = json.accounts.filter((a: { access: string }) => a.access === "balance");
  expect(priv).toHaveLength(1);
  expect(priv[0]).toMatchObject({ name: "Private account", institution: null, mask: null });
  const tx = await apiGet(context, `/api/transactions?accountId=${priv[0].id}`);
  expect(tx.json.transactions).toEqual([]);
  await page.goto("/accounts");
  await expect(page.locator('[data-access="balance"]')).toContainText("Private account");
  await expect(page.getByText("PC Financial Mastercard")).toHaveCount(0);
  const res = await context.request.patch(`/api/accounts/${priv[0].id}`, {
    data: { visibility: "SHARED" },
  });
  expect(res.status()).toBe(403);
});

test("owner hides an account; the other user loses it immediately", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "mutates shared demo data; run once");
  const k = await browser.newContext();
  const w = await browser.newContext();
  const kp = await k.newPage();
  const wp = await w.newPage();
  await login(kp, "kanchit");
  await login(wp, "wife");
  const before = await apiGet(w, "/api/accounts");
  const target = before.json.accounts.find((a: { name: string }) => a.name === "TD Credit Card");
  expect(target).toBeTruthy();

  await kp.goto("/accounts");
  const row = kp.getByTestId("account-row").filter({ hasText: "TD Credit Card" });
  await row.getByTestId("visibility-select").selectOption("HIDDEN");
  await expect
    .poll(async () =>
      (await apiGet(w, "/api/accounts")).json.accounts.some(
        (a: { id: string }) => a.id === target.id,
      ),
    )
    .toBe(false);
  expect((await apiGet(w, `/api/transactions?accountId=${target.id}`)).json.transactions).toEqual(
    [],
  );

  await wp.goto("/settings/audit");
  await expect(wp.getByTestId("audit-log")).toContainText("account.visibility");

  await row.getByTestId("visibility-select").selectOption("SHARED");
  await expect
    .poll(async () =>
      (await apiGet(w, "/api/accounts")).json.accounts.some(
        (a: { id: string }) => a.id === target.id,
      ),
    )
    .toBe(true);
  await k.close();
  await w.close();
});

test("member cannot manage household settings or invites", async ({ page, context }) => {
  await login(page, "wife");
  await page.goto("/settings/household");
  await expect(page.getByText("Only the household owner")).toBeVisible();
  expect(
    (
      await context.request.post("/api/household/invites", { data: { email: "x@example.com" } })
    ).status(),
  ).toBe(403);
  expect(
    (await context.request.patch("/api/household", { data: { jointSplitPct: 90 } })).status(),
  ).toBe(403);
});

test("connections page shows Plaid Items used 5/10", async ({ page }) => {
  await login(page, "kanchit");
  await page.goto("/settings/connections");
  await expect(page.getByTestId("plaid-usage")).toContainText("5/10");
  await expect(page.getByTestId("plaid-usage")).toContainText("Kanchit 3 · Wife 2");
});

test("setup wizard saves checkboxes and runs connection tests", async ({ page }) => {
  await login(page, "kanchit");
  await page.goto("/settings/setup");
  const step = page.getByTestId("setup-step-base-accounts");
  await step.getByRole("checkbox").first().check();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(
    page.getByTestId("setup-step-base-accounts").getByRole("checkbox").first(),
  ).toBeChecked();
  await page.getByTestId("setup-step-base-accounts").getByRole("button", { name: /Test/ }).click();
  await expect(
    page.getByTestId("setup-step-base-accounts").getByTestId("setup-test-result"),
  ).toContainText("Database reachable");
  await page.getByTestId("setup-step-plaid").getByRole("button", { name: /Test/ }).click();
  await expect(page.getByTestId("setup-step-plaid").getByTestId("setup-test-result")).toContainText(
    "Not configured",
  );
});
