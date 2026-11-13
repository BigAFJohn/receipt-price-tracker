import { expect, test, type Page } from "@playwright/test";
import { supabaseConfigured } from "../expected";

/**
 * Sign-up. The wrong-code test needs the "Before User Created" hook set up in
 * Supabase. A successful sign-up creates a real account that tests can't
 * delete, so it only runs when TEST_INVITE_CODE is set.
 */

async function fill(page: Page, f: { email?: string; password?: string; code?: string; consent?: boolean }) {
  if (f.email !== undefined) await page.getByLabel("Email").fill(f.email);
  if (f.password !== undefined) await page.getByLabel("Password").fill(f.password);
  if (f.code !== undefined) await page.getByLabel("Invite code").fill(f.code);
  if (f.consent) await page.getByLabel("I understand the app's owner can see the receipts I upload.").check();
}

test.describe("Sign-up", () => {
  test.skip(!supabaseConfigured, "Supabase not configured");

  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  });

  test("is reachable from the sign-in page and says who sees the receipts", async ({ page }) => {
    await expect(page.getByTestId("signup-privacy")).toContainText("The app's owner can see your receipts");
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("asks for agreement before anything is sent", async ({ page }) => {
    await fill(page, { email: "new.person@example.com", password: "long enough", code: "ANY-CODE" });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-error")).toHaveText(
      "Tick the box to confirm you've read how your receipts are used",
    );
  });

  test("refuses a wrong invite code", async ({ page }) => {
    await fill(page, {
      email: `nobody-${crypto.randomUUID().slice(0, 8)}@example.com`,
      password: "long enough",
      code: "NOT-A-REAL-CODE",
      consent: true,
    });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-error")).toHaveText("That invite code isn't valid.");
    await expect(page).toHaveURL(/\/signup$/);
    // The form keeps what was typed, except the password
    await expect(page.getByLabel("Invite code")).toHaveValue("NOT-A-REAL-CODE");
    await expect(page.getByLabel("Email")).toHaveValue(/^nobody-/);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  test("creates an account with a valid code and opens the receipts", async ({ page }) => {
    const code = process.env.TEST_INVITE_CODE;
    test.skip(!code, "set TEST_INVITE_CODE to run: it leaves a test account behind");

    await fill(page, {
      email: `signup-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
      password: "long enough",
      code: code!,
      consent: true,
    });
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/receipts$/);
    // A new account gets the default monthly allowance.
    await expect(page.getByTestId("readings-left")).toContainText(/of 20 receipt readings left/);
  });
});
