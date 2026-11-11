import { expect, test } from "@playwright/test";
import { supabaseConfigured, testUser } from "../expected";
import { signIn } from "../helpers/auth";

test.describe("Sign in", () => {
  test("a signed-out visit to /receipts lands on the login page", async ({ page }) => {
    await page.goto("/receipts");

    await expect(page).toHaveURL(/\/login\?next=%2Freceipts$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a signed-out visit to /products lands on the login page", async ({ page }) => {
    await page.goto("/products");

    await expect(page).toHaveURL(/\/login\?next=%2Fproducts$/);
  });

  test("a signed-out visit to /spending lands on the login page", async ({ page }) => {
    await page.goto("/spending");

    await expect(page).toHaveURL(/\/login\?next=%2Fspending$/);
  });

  test("asks for both fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("login-error")).toHaveText("Enter your email and password.");
  });

  test("rejects a wrong password", async ({ page }) => {
    test.skip(!supabaseConfigured, "Supabase keys not set");

    await page.goto("/login");
    await signIn(page, "nobody@example.com", "wrong-password");

    await expect(page.getByTestId("login-error")).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in, reaches receipts, and signs out", async ({ page }) => {
    test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

    await page.goto("/receipts");
    await signIn(page, testUser!.email, testUser!.password);

    await expect(page).toHaveURL(/\/receipts$/);
    await expect(page.getByTestId("signed-in-as")).toHaveText(`Signed in as ${testUser!.email}`);

    // Signed in, /login sends you on to your receipts.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/receipts$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/receipts");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
