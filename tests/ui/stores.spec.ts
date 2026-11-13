import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";
import { draftReceipt, signedInClient } from "../helpers/receipts";

/**
 * Receipts from any store: the review screen starts on the store Claude read,
 * one you have or a new one. Drafts are seeded without Claude; everything is
 * deleted again afterwards.
 */

test.describe("Stores", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  let supabase: SupabaseClient;
  const receiptIds: string[] = [];
  const store = `Jumbo test-${crypto.randomUUID().slice(0, 8)}`;
  const line = { text: "JUMBO HALFVOLLE MELK", unitPrice: 1.09 };

  test.beforeEach(async () => {
    supabase = await signedInClient(testUser!);
  });

  test.afterEach(async () => {
    await supabase.from("receipts").delete().in("id", receiptIds.splice(0));
    await supabase.from("stores").delete().eq("name", store);
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });

  test("adds a store you don't have yet, under the name Claude read", async ({ page }) => {
    const id = await draftReceipt(supabase, { store: null, storeRead: store, at: "2026-11-12T10:00:00+01:00", lines: [line] });
    receiptIds.push(id);

    await page.goto(`/receipts/${id}`);
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByLabel("Store").locator("option:checked")).toHaveText("New store…");
    await expect(page.getByLabel("New store name")).toHaveValue(store);
    await expect(page.getByTestId("new-store-note")).toHaveText("Added to your stores when you save.");

    await page.getByRole("button", { name: "Confirm receipt" }).click();
    await expect(page).toHaveURL(/\/receipts$/);
    await expect(page.locator(`[data-receipt-id="${id}"]`)).toContainText(store);

    // Now one of your stores: the next receipt from it starts with it chosen
    const next = await draftReceipt(supabase, {
      store: null,
      storeRead: store.toUpperCase(),
      at: "2026-11-13T10:00:00+01:00",
      lines: [line],
    });
    receiptIds.push(next);
    await page.goto(`/receipts/${next}`);
    await expect(page.getByLabel("Store").locator("option:checked")).toHaveText(store);
    await expect(page.getByLabel("New store name")).toHaveCount(0);
  });

  test("recognises a store you have when the receipt prints it differently", async ({ page }) => {
    const id = await draftReceipt(supabase, {
      store: null,
      storeRead: "ALBERT HEIJN B.V.",
      at: "2026-11-12T10:00:00+01:00",
      lines: [line],
    });
    receiptIds.push(id);

    await page.goto(`/receipts/${id}`);
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByLabel("Store").locator("option:checked")).toHaveText("Albert Heijn");
  });

  test("asks for a name when adding a new store by hand", async ({ page }) => {
    const id = await draftReceipt(supabase, { store: "Hoogvliet", at: "2026-11-12T10:00:00+01:00", lines: [line] });
    receiptIds.push(id);

    await page.goto(`/receipts/${id}`);
    await signIn(page, testUser!.email, testUser!.password);
    await page.getByLabel("Store").selectOption({ label: "New store…" });
    await expect(page.getByLabel("New store name")).toHaveValue("");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "highlighted" })).toHaveText(
      "Fix the highlighted fields first.",
    );
    await expect(page.getByLabel("New store name")).toHaveAttribute("aria-invalid", "true");
  });
});
