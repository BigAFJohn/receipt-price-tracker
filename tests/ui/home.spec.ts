import { expect, test } from "@playwright/test";
import { SEEDED_STORES, supabaseConfigured } from "../expected";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the app title", async ({ page }) => {
    await expect(page).toHaveTitle("Receipt Price Tracker");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Receipt Price Tracker");
  });

  test("shows setup instructions when not configured", async ({ page }) => {
    test.skip(supabaseConfigured, "Supabase is configured");

    await expect(page.getByTestId("db-status")).toContainText("Not configured");
  });

  test("lists the seeded stores when connected", async ({ page }) => {
    test.skip(!supabaseConfigured, "Supabase keys not set");

    await expect(page.getByTestId("db-status")).toContainText("Connected");
    const stores = page.getByTestId("store-list").getByRole("listitem");
    for (const name of SEEDED_STORES) {
      await expect(stores.filter({ hasText: name })).toHaveCount(1);
    }
  });
});
