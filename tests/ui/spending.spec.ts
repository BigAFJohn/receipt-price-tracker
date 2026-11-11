import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";
import { confirmReceipt, euro, signedInClient } from "../helpers/receipts";

/**
 * Seeds receipts in January and February 2099, so they're the newest months
 * whatever real receipts the account has, then checks the spending page.
 * Everything it adds is deleted again afterwards.
 */

test.describe("Spending", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
  test.describe.configure({ mode: "serial" });

  let supabase: SupabaseClient;
  let productId: string;
  const receiptIds: string[] = [];
  const product = `Spending cola test-${crypto.randomUUID().slice(0, 8)}`;

  test.beforeEach(async ({ page }) => {
    supabase = await signedInClient(testUser!);
    const { data: drinks } = await supabase.from("categories").select("id").eq("name", "Drinks").single();
    const { data } = await supabase
      .from("products")
      .insert({ name: product, size_value: 1, size_unit: "L", category_id: drinks!.id })
      .select("id")
      .single();
    productId = data!.id;

    receiptIds.push(
      // January: one bottle at € 1,00
      await confirmReceipt(supabase, {
        store: "Albert Heijn",
        at: "2099-01-15T12:00:00+01:00",
        lines: [{ text: "TEST COLA 1L", unitPrice: 1, productId }],
      }),
      // February: two bottles at € 2,00 with € 0,50 off, a line without a product, and a deposit
      await confirmReceipt(supabase, {
        store: "Albert Heijn",
        at: "2099-02-15T12:00:00+01:00",
        lines: [
          { text: "TEST COLA 1L", quantity: 2, unitPrice: 2, discount: 0.5, productId },
          { text: "TEST MYSTERY", unitPrice: 0.41 },
          { text: "STATIEGELD", quantity: 2, unitPrice: 0.15, isDeposit: true },
        ],
      }),
    );

    await page.goto("/spending?month=2099-02");
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByRole("heading", { name: "Spending", level: 1 })).toBeVisible();
  });

  test.afterEach(async () => {
    await supabase.from("receipts").delete().in("id", receiptIds.splice(0));
    await supabase.from("products").delete().eq("id", productId);
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });

  test("adds up each month, by category", async ({ page }) => {
    const months = page.getByTestId("months").getByRole("link");
    await expect(months.filter({ hasText: "February 2099" })).toContainText(euro("€ 4,21"));
    await expect(months.filter({ hasText: "January 2099" })).toContainText(euro("€ 1,00"));
    await expect(months.filter({ hasText: "February 2099" })).toHaveAttribute("aria-current", "page");

    // February: € 3,50 of drinks, € 0,41 not matched, € 0,30 deposit
    const categories = page.getByTestId("categories").getByRole("listitem");
    await expect(categories).toHaveText([
      euro("Drinks€ 3,50 83.1%"),
      euro("Not matched€ 0,41 9.7%"),
      euro("Deposits€ 0,30 7.1%"),
    ]);
    await expect(page.getByTestId("month-total")).toHaveText(euro("Total € 4,21"));

    // Choosing January shows January
    await months.filter({ hasText: "January 2099" }).click();
    await expect(page).toHaveURL(/month=2099-01$/);
    await expect(page.getByRole("heading", { name: /By category/ })).toContainText("January 2099");
    await expect(categories).toHaveText([euro("Drinks€ 1,00 100%")]);
  });

  test("lists a product whose shelf price went up at the same store", async ({ page }) => {
    // € 1,00 → € 2,00 per L at Albert Heijn
    const rise = page.getByTestId("increases").getByRole("listitem").filter({ hasText: product });
    await expect(rise).toContainText("+100%");
    await expect(rise).toContainText(euro("Albert Heijn: € 1,00 per L on 15 Jan → € 2,00 per L on 15 Feb"));

    await rise.getByRole("link", { name: product }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(product);
  });
});
