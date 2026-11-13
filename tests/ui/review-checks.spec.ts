import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";
import { draftReceipt, euro, signedInClient } from "../helpers/receipts";

/**
 * The review screen's second look at a receipt, on a draft like the one where
 * this went wrong: a misread price, other lines linked to the croissant, and
 * Claude guessing a tracked product. Seeded without Claude; cleaned up after.
 */

test.describe("Review checks", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  let supabase: SupabaseClient;
  let productId: string;
  let receiptId: string;
  const product = `Croissant test-${crypto.randomUUID().slice(0, 8)}`;
  const linkedTo = (line: number) => `Product, line ${line}`;

  test.beforeEach(async ({ page }) => {
    supabase = await signedInClient(testUser!);
    const { data } = await supabase
      .from("products")
      .insert({ name: product, size_value: 1, size_unit: "pcs" })
      .select("id")
      .single();
    productId = data!.id;
    const guess = { name: product, existing: true, brand: null, size_value: 1, size_unit: "pcs" as const, category: null };

    receiptId = await draftReceipt(supabase, {
      store: "Hoogvliet",
      at: "2026-11-05T12:38:00+01:00",
      lines: [
        // 0,48 misread as 0,40: 2 × 0,40 isn't the 0,96 printed
        { text: "HOOGVLIET CROISSANT", quantity: 2, unitPrice: 0.4, lineTotal: 0.96, productId },
        // Claude thinks it's the croissant: offered, not chosen
        { text: "APPELSIENTJE MULTI", unitPrice: 1.91, suggestedProduct: guess },
        // Linked to the croissant by mistake
        { text: "HOOGVLIET SAUCIJZEN", unitPrice: 0.98, productId },
      ],
    });

    await page.goto(`/receipts/${receiptId}`);
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByTestId("review-form")).toBeVisible();
  });

  test.afterEach(async () => {
    await supabase.from("receipts").delete().eq("id", receiptId);
    await supabase.from("products").delete().eq("id", productId);
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });

  test("points out a misread price, a shared product and Claude's guess", async ({ page }) => {
    const rows = page.getByTestId("line-row");

    // Quantity × price doesn't make the line total
    await expect(rows.nth(0).getByTestId("line-math")).toHaveText(
      euro("2 × € 0,40 = € 0,80, but the line total is € 0,96. Check the quantity and price on the photo."),
    );
    await page.getByLabel("Unit price, line 1").fill("0.48");
    await expect(rows.nth(0).getByTestId("line-math")).toHaveCount(0);

    // Two different lines on one product
    await expect(page.getByTestId("shared-products")).toContainText(`Lines 1 and 3 are both linked to ${product}`);

    // Claude's guess is offered, not chosen
    await expect(page.getByLabel(linkedTo(2))).toHaveValue("");
    await expect(rows.nth(1).getByTestId("claudes-guess")).toContainText(`Claude thinks this is ${product}.`);
    await rows.nth(1).getByRole("button", { name: `Use ${product}` }).click();
    await expect(page.getByLabel(linkedTo(2))).toHaveValue(`${product} · 1 pcs`);
    await expect(page.getByTestId("shared-products")).toContainText(`Lines 1, 2 and 3 are all linked to ${product}`);

    // Unlinking the wrong lines clears the warning
    await page.getByLabel(linkedTo(2)).fill("");
    await page.getByLabel(linkedTo(3)).fill("");
    await expect(page.getByTestId("shared-products")).toHaveCount(0);

    // Typing a product's name, in any letters, links it
    await page.getByLabel(linkedTo(2)).fill(product.toLowerCase());
    await expect(page.getByTestId("shared-products")).toContainText(`Lines 1 and 2 are both linked to ${product}`);

        // A name you don't have offers to add it, starting from what you typed
    const newName = `Sinaasappelsap test-${crypto.randomUUID().slice(0, 8)}`;
    await page.getByLabel(linkedTo(2)).fill(newName);
    await expect(rows.nth(1).getByTestId("unknown-product")).toContainText(
      `You don't have a product called “${newName}”.`,
    );
    await rows.nth(1).getByRole("button", { name: "Add it as a new product" }).click();
    await expect(rows.nth(1).getByTestId("product-form").getByLabel("Name")).toHaveValue(newName);

  });

  test("keeps a fuel price to a tenth of a cent", async ({ page }) => {
    const fuel = await draftReceipt(supabase, {
      store: "Hoogvliet",
      at: "2026-10-09T06:26:00+02:00",
      lines: [{ text: "95 ongelood", quantity: 36.36, unitPrice: 2.449, lineTotal: 89.05 }],
    });

    try {
      await page.goto(`/receipts/${fuel}`);
      await expect(page.getByLabel("Unit price, line 1")).toHaveValue("2.449");
      // 36,36 × 2,449 makes the 89,05 printed: nothing to warn about
      await expect(page.getByTestId("line-math")).toHaveCount(0);

      await page.getByRole("button", { name: "Confirm receipt" }).click();
      await expect(page).toHaveURL(/\/receipts$/);
      await page.locator(`[data-receipt-id="${fuel}"]`).getByRole("link").click();
      await expect(page.getByRole("cell", { name: euro("€ 2,449") })).toBeVisible();
    } finally {
      await supabase.from("receipts").delete().eq("id", fuel);
    }
  });
});
