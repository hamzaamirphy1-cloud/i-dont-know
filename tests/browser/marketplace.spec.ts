import { expect, test, type Page } from "@playwright/test";

/**
 * Public-only browser checks. These never register accounts, create purchases,
 * or change application data. Run against an app with the documented seed data.
 */
async function openCatalog(page: Page) {
  await page.goto("/");
  await expect(page.locator(".project-card").first()).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
}

async function changeFilter(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/products?") &&
      r.request().method() === "GET" &&
      r.ok(),
  );
  await action();
  await response;
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await expect(page.locator(".project-card").first()).toBeVisible();
}

async function visiblePrices(page: Page) {
  const labels = await page.locator(".card-bottom b").allTextContents();
  return labels.map((label) => Number(label.replace(/[^\d.]/g, "")));
}

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await openCatalog(page);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("shows seeded projects with honest sample and review labels", async ({
  page,
}) => {
  await expect
    .poll(() => page.locator(".project-card").count())
    .toBeGreaterThanOrEqual(6);
  for (const name of [
    "ClinicOS",
    "Storefront",
    "Learnify",
    "Teamflow",
    "TableTalk",
    "Nestly",
  ]) {
    const card = page
      .locator(".project-card")
      .filter({
        has: page.locator(".card-title", { hasText: name }),
      })
      .first();
    await expect(card).toBeVisible();
    await expect(card.locator(".sample-badge")).toHaveText("SAMPLE PROJECT");
    await expect(card.locator(".card-tag")).toContainText(
      /Not audited|Review recorded/,
    );
  }
});

test("searches the catalog and filters by category, budget and technology", async ({
  page,
}) => {
  await changeFilter(page, () =>
    page
      .getByRole("textbox", { name: "Search projects", exact: true })
      .fill("ClinicOS"),
  );
  await expect(page.locator(".card-title").first()).toContainText("ClinicOS");

  await changeFilter(page, () =>
    page.getByRole("button", { name: "Clear filters", exact: true }).click(),
  );
  await changeFilter(page, () =>
    page.getByRole("button", { name: "Education", exact: true }).click(),
  );
  await expect(
    page.getByRole("button", { name: "Education", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".card-title").filter({ hasText: "Learnify" }),
  ).toBeVisible();
  for (const tag of await page.locator(".card-tag").allTextContents()) {
    expect(tag).toContain("Education");
  }

  await changeFilter(page, () =>
    page.getByRole("button", { name: "Clear filters", exact: true }).click(),
  );
  await changeFilter(page, () =>
    page.getByLabel(/^Budget/).selectOption("100"),
  );
  expect((await visiblePrices(page)).every((price) => price <= 100)).toBe(true);
  await expect(
    page.locator(".card-title").filter({ hasText: "Teamflow" }),
  ).toBeVisible();

  await changeFilter(page, () =>
    page.getByRole("button", { name: "Clear filters", exact: true }).click(),
  );
  await changeFilter(page, () =>
    page.getByLabel(/^Technology/).selectOption("React"),
  );
  for (const stack of await page.locator(".card-stack").allTextContents()) {
    expect(stack).toContain("React");
  }
});

test("sorts current catalog prices in both directions", async ({ page }) => {
  await changeFilter(page, () =>
    page.getByRole("combobox", { name: "Sort projects" }).selectOption("low"),
  );
  await expect
    .poll(async () => {
      const prices = await visiblePrices(page);
      return (
        prices.length >= 6 &&
        prices.every((price, i) => !i || prices[i - 1] <= price)
      );
    })
    .toBe(true);
  await changeFilter(page, () =>
    page.getByRole("combobox", { name: "Sort projects" }).selectOption("high"),
  );
  await expect
    .poll(async () => {
      const prices = await visiblePrices(page);
      return (
        prices.length >= 6 &&
        prices.every((price, i) => !i || prices[i - 1] >= price)
      );
    })
    .toBe(true);
});

test("switches between English and Bengali and persists the preference", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Change language", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "আপনার পরের বড় আইডিয়া।",
  );
  await expect(
    page.getByRole("textbox", { name: "প্রজেক্ট খুঁজুন", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await page
    .getByRole("button", { name: "Change language", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your next big thing.",
  );
});

test("shows license, seller, review and integration states in project details", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "View ClinicOS", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "ClinicOS", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".seller-line")).toContainText("Built by");
  await expect(dialog.locator(".feature-list li").first()).toBeVisible();
  await expect(
    dialog.getByText("License & ownership", { exact: true }),
  ).toBeVisible();
  await dialog.getByText("License & ownership", { exact: true }).click();
  await expect(dialog.locator(".license-details p")).toBeVisible();
  await expect(dialog.locator(".notice")).toContainText(
    /Not independently audited|Human review recorded/,
  );
  await expect(dialog.locator(".connection-state")).toContainText(
    /Payments: Not connected|Stripe test keys configured/,
  );
  await expect(dialog.locator(".connection-state")).toContainText(
    /Source download: Not connected|Source archive attached/,
  );
  if (
    (await dialog.locator(".connection-state").textContent())?.includes(
      "Not connected",
    )
  ) {
    await expect(
      dialog.getByRole("button", { name: "Buy with Stripe test", exact: true }),
    ).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("keeps the catalog within the viewport and opens the guest workspace", async ({
    page,
  }) => {
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "My workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your next chapter starts here.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }).last(),
    ).toBeVisible();
  });
});

test("keeps builder intent when a visitor starts from Sell a project", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Sell a project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("select[name=role]")).toHaveValue("builder");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(dialog.locator("select[name=role]")).toHaveValue("builder");
});

test("keyboard navigation reaches the license disclosure after screenshots", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "View ClinicOS", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".screenshots a").last()).toBeVisible();
  await dialog.locator(".screenshots a").last().focus();
  await page.keyboard.press("Tab");
  await expect(dialog.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".license-details p")).toBeVisible();
});

test("opens a public seller profile from project details", async ({ page }) => {
  await page
    .getByRole("button", { name: "View ClinicOS", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator(".seller-line")
    .getByRole("button", { name: "Rafi Studio", exact: true })
    .click();
  const profile = page.getByRole("dialog");
  await expect(
    profile.getByRole("heading", { name: "Rafi Studio", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByText("Published projects", { exact: true }),
  ).toBeVisible();
  await expect(profile.getByText("ClinicOS", { exact: true })).toBeVisible();
});
