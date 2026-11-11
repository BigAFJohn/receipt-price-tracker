import { expect, test, type Page } from "@playwright/test";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";

const PRODUCT_URL = /\/products\/([0-9a-f-]{36})$/;

/** A name no other test (or real product) uses, so tests can share one account. */
const uniqueName = (base: string) => `${base} test-${crypto.randomUUID().slice(0, 8)}`;

/**
 * The product form on screen. Next.js keeps the list page (with its own form)
 * in the page, hidden, while a product is open, so only the visible one counts.
 */
const productForm = (page: Page) => page.getByTestId("product-form").filter({ visible: true });
const formMessage = (page: Page) => productForm(page).getByTestId("product-message");

/** Fills in a product form. */
async function fillProduct(
  page: Page,
  p: { name?: string; brand?: string; category?: string; size?: string; unit?: string },
) {
  const form = productForm(page);
  if (p.name !== undefined) await form.getByLabel("Name").fill(p.name);
  if (p.brand !== undefined) await form.getByLabel("Brand (optional)").fill(p.brand);
  if (p.category !== undefined) await form.getByLabel("Category").selectOption({ label: p.category });
  if (p.size !== undefined) await form.getByLabel("Size").fill(p.size);
  if (p.unit !== undefined) await form.getByLabel("Unit").selectOption(p.unit);
}

/** The product's row on the list page. */
const listItem = (page: Page, name: string) =>
  page.getByTestId("product-list").getByRole("listitem").filter({ hasText: name });

test.describe("Products", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/products");
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByRole("heading", { name: "Your products" })).toBeVisible();
  });

  test("adds, edits and deletes a product", async ({ page }) => {
    const name = uniqueName("Cola Zero");

    // Add
    await fillProduct(page, { name, brand: "Coca-Cola", category: "Drinks", size: "1,5", unit: "L" });
    await productForm(page).getByRole("button", { name: "Add product" }).click();
    await expect(formMessage(page)).toHaveText(`Added ${name}.`);
    await expect(productForm(page).getByLabel("Name")).toHaveValue("");
    await expect(listItem(page, name).getByTestId("product-details")).toHaveText(
      "Coca-Cola · 1,5 L · Drinks · not bought yet",
    );

    // Edit: a can, typed in ml
    await listItem(page, name).getByRole("link").click();
    await expect(page).toHaveURL(PRODUCT_URL);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(productForm(page).getByLabel("Size")).toHaveValue("1.5");
    await fillProduct(page, { size: "330", unit: "ml" });
    await productForm(page).getByRole("button", { name: "Save changes" }).click();
    await expect(formMessage(page)).toHaveText("Saved.");

    // Stored as 0.33 L, shown again as 330 ml
    await page.reload();
    await expect(productForm(page).getByLabel("Size")).toHaveValue("330");
    await expect(productForm(page).getByLabel("Unit")).toHaveValue("ml");

    // Delete
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete product" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(listItem(page, name)).toHaveCount(0);
  });

  test("refuses a second product with the same name", async ({ page }) => {
    const name = uniqueName("Halfvolle melk");

    await fillProduct(page, { name, category: "Dairy & eggs", size: "1", unit: "L" });
    await productForm(page).getByRole("button", { name: "Add product" }).click();
    await expect(formMessage(page)).toHaveText(`Added ${name}.`);

    await fillProduct(page, { name, size: "1", unit: "L" });
    await productForm(page).getByRole("button", { name: "Add product" }).click();
    await expect(formMessage(page)).toHaveText(`You already have a product called "${name}".`);
    await expect(listItem(page, name)).toHaveCount(1);

    // Clean up
    await listItem(page, name).getByRole("link").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete product" }).click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test("explains a size that isn't a number", async ({ page }) => {
    await fillProduct(page, { name: uniqueName("Bananen"), size: "a bunch" });
    await productForm(page).getByRole("button", { name: "Add product" }).click();

    await expect(formMessage(page)).toHaveText("Enter the size as a number, e.g. 1.5");
  });
});