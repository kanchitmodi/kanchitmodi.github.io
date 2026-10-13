import { expect, test, type Page } from "@playwright/test";
import { apiGet, login } from "./helpers";

const FX = "tests/fixtures/import";

async function upload(page: Page, file: string) {
  await page.getByTestId("import-file").setInputFiles(`${FX}/${file}`);
  await expect(page.getByTestId("preview-counts")).toBeVisible();
}

test("import a bank CSV: detect, preview, commit, and re-import finds only duplicates", async ({
  page,
  context,
}, info) => {
  // Each device project imports a different file so runs don't interfere.
  const desktop = info.project.name === "desktop-chrome";
  const file = desktop ? "td-visa.csv" : "rogers.csv";
  const account = desktop ? "TD Credit Card" : "Rogers Mastercard";
  const expected = desktop ? 5 : 4;

  await login(page, "kanchit");
  await page.goto("/import");
  await upload(page, file);
  await expect(page.getByText(desktop ? "Detected TD" : "Detected Rogers Bank")).toBeVisible();
  const select = page.getByLabel("Account", { exact: true });
  if (desktop) await select.selectOption({ label: `${account} ··3302` });
  else await expect(select).toHaveValue(/.+/); // auto-suggested: only one Rogers Bank account
  await expect(page.getByTestId("preview-counts")).toContainText(`${expected} new`);
  await expect(page.getByTestId("preview-row").first()).toBeVisible();
  await page.getByRole("button", { name: `Import ${expected} transactions` }).click();
  await expect(page.getByTestId("import-result")).toContainText(
    `Imported ${expected} transactions`,
  );

  // Re-importing the same file adds nothing
  await upload(page, file);
  if (desktop)
    await page.getByLabel("Account", { exact: true }).selectOption({ label: `${account} ··3302` });
  await expect(page.getByTestId("preview-counts")).toContainText(`0 new · ${expected} duplicates`);
  await expect(page.getByRole("button", { name: "Import 0 transactions" })).toBeDisabled();
  await page.getByRole("button", { name: "Discard" }).click();

  // Imported transactions are categorized and searchable
  const q = desktop ? "Petro" : "Pai Northern";
  const { json } = await apiGet(
    context,
    `/api/transactions?q=${encodeURIComponent(q)}&from=2026-09-01&to=2026-09-30`,
  );
  const hit = json.transactions.find((t: { source: string }) => t.source === "CSV");
  expect(hit.category.name).toBe(desktop ? "Gas" : "Dining");
  await page.goto("/import");
  await expect(page.getByTestId("coverage")).toContainText(account);
});

test("create a new account while importing an unknown bank's CSV", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "creates data; run once");
  await login(page, "wife");
  await page.goto("/import");
  await upload(page, "generic.csv");
  await expect(page.getByText("Unrecognized bank format")).toBeVisible();
  await page.getByRole("button", { name: "New account" }).click();
  const form = page.getByTestId("new-account-form");
  await form.getByLabel("Account name").fill("Corner Store Card");
  await form.getByLabel("Institution").fill("Corner Credit Union");
  await form.getByLabel("Type").selectOption("CREDIT_CARD");
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Account", { exact: true })).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Import 2 transactions" }).click();
  await expect(page.getByTestId("import-result")).toContainText("Imported 2");
  await page.goto("/accounts");
  await expect(page.getByText("Corner Store Card", { exact: true })).toBeVisible();
});

test("edit a transaction: correction becomes a rule, note, comment, split, history", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-chrome", "mutates shared demo data; run once");
  await login(page, "kanchit");
  await page.goto("/transactions?q=Netflix");
  await page.getByTestId("txn-row").first().click();
  await expect(page.getByRole("heading", { name: "Netflix", level: 1 })).toBeVisible();

  await page.locator("select#category").selectOption({ label: "Shopping" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rule saved" })).toContainText(
    "other Netflix transaction",
  );

  await page.locator("textarea#notes").fill("Family plan");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Note saved" })).toBeVisible();

  await page.getByLabel("Add a comment").fill("Should we downgrade?");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByTestId("comments")).toContainText("Should we downgrade?");
  await expect(page.getByTestId("comments")).toContainText("Kanchit");

  await page.getByRole("button", { name: "Split across categories" }).click();
  await page.getByLabel("Part 1 category").selectOption({ label: "Subscriptions" });
  await page.getByLabel("Part 1 amount").fill("15.00");
  await page.getByLabel("Part 2 category").selectOption({ label: "Kids" });
  await expect(page.getByTestId("split-remaining")).toContainText("left to assign");
  await page.getByLabel("Part 2 amount").fill("5.99");
  await expect(page.getByTestId("split-remaining")).toContainText("Adds up");
  await page.getByRole("button", { name: "Save split" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Split saved" })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("history")).toContainText(
    "Kanchit changed category from Subscriptions to Shopping",
  );
  await expect(page.getByTestId("history")).toContainText("Kanchit changed splits");

  // The rule shows up in Settings and every Netflix charge moved
  await page.goto("/settings/categories");
  await expect(page.getByTestId("rules-list")).toContainText("NETFLIX");
  await page.goto("/transactions?q=Netflix");
  for (const row of await page.getByTestId("txn-row").all())
    await expect(row).toContainText(/Shopping|Split/);
});

test("review queue and filters", async ({ page }) => {
  await login(page, "kanchit");
  await page.goto("/transactions");
  await page.getByTestId("review-filter").click();
  await expect(page).toHaveURL(/review=1/);
  await page.goto("/transactions");
  await page.getByLabel("Category").selectOption({ label: "Gas" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/category=/);
  for (const row of (await page.getByTestId("txn-row").all()).slice(0, 10))
    await expect(row).toContainText(/Gas|Split/);
});

test("the other member can't open a private transaction by URL", async ({ browser }) => {
  const k = await browser.newContext();
  const w = await browser.newContext();
  const kp = await k.newPage();
  const wp = await w.newPage();
  await login(kp, "kanchit");
  await login(wp, "wife");
  const { json } = await apiGet(k, "/api/transactions?q=Air%20Canada&limit=50");
  // Kanchit's hidden CIBC card (other Air Canada charges may exist on shared cards)
  const id = json.transactions.find(
    (t: { account: { name: string } }) => t.account.name === "CIBC Credit Card",
  ).id;
  expect((await w.request.get(`/api/transactions/${id}`)).status()).toBe(404);
  expect(
    (await w.request.patch(`/api/transactions/${id}`, { data: { notes: "x" } })).status(),
  ).toBe(404);
  const res = await wp.goto(`/transactions/${id}`);
  expect(res?.status()).toBe(404);
  await k.close();
  await w.close();
});

test("categories can be added", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "mutates shared data; run once");
  await login(page, "wife");
  await page.goto("/settings/categories");
  await page.getByLabel("New category").fill("Pets");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("category-list").getByLabel("Name").last()).toHaveValue("Pets");
  await expect(page.getByTestId("ai-usage")).toContainText("monthly cap");
});
