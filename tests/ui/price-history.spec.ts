import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";

/**
 * Seeds confirmed receipts straight into Supabase (no Claude needed), then
 * checks the product page shows their price history. Everything it adds is
 * deleted again afterwards.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Intl puts a non-breaking space between € and the amount. */
const euro = (text: string) => text.replace(/ /g, " ");

type Purchase = { store: string; at: string; quantity: number; unitPrice: number; discount?: number };

async function confirmReceipt(supabase: SupabaseClient, productId: string, p: Purchase) {
  const { data: store } = await supabase.from("stores").select("id").eq("name", p.store).single();
  const { data: receipt } = await supabase.from("receipts").insert({ status: "draft" }).select("id").single();
  const lineTotal = Math.round(p.quantity * p.unitPrice * 100) / 100;
  const discount = p.discount ?? 0;
  const { error } = await supabase.rpc("save_receipt", {
    p_receipt_id: receipt!.id,
    p_store_id: store!.id,
    p_purchased_at: p.at,
    p_total: Math.round((lineTotal - discount) * 100) / 100,
    p_lines: [
      {
        line_no: 1,
        raw_text: "TEST COLA ZERO 1,5L",
        sku: null,
        quantity: p.quantity,
        is_weighed: false,
        unit_price: p.unitPrice,
        line_total: lineTotal,
        discount,
        is_deposit: false,
        confidence: null,
        product_id: productId,
      },
    ],
    p_confirm: true,
  });
  expect(error).toBeNull();
  return receipt!.id as string;
}

test.describe("Price history", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  let supabase: SupabaseClient;
  let productId: string;
  const receiptIds: string[] = [];
  const name = `Cola Zero test-${crypto.randomUUID().slice(0, 8)}`;

  test.beforeEach(async ({ page }) => {
    supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await supabase.auth.signInWithPassword(testUser!)).error).toBeNull();
    const { data } = await supabase
      .from("products")
      .insert({ name, size_value: 1.5, size_unit: "L" })
      .select("id")
      .single();
    productId = data!.id;

    await page.goto(`/products/${productId}`);
    await signIn(page, testUser!.email, testUser!.password);
    // Signing in returns to the product page.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  });

  test.afterEach(async () => {
    if (receiptIds.length) await supabase.from("receipts").delete().in("id", receiptIds.splice(0));
    await supabase.from("products").delete().eq("id", productId);
    await supabase.auth.signOut({ scope: "local" }); // don't end other tests' sessions
  });

  test("explains that a product without purchases has no history yet", async ({ page }) => {
    await expect(page.getByTestId("price-empty")).toContainText("No purchases yet.");
  });

  test("shows the shelf price and what you paid per litre, over time", async ({ page }) => {
    // 1,5 L bottles: € 1,79 at AH, then 2 for € 3,38 with € 0,50 Bonus at Hoogvliet, then € 1,99 at AH
    receiptIds.push(
      await confirmReceipt(supabase, productId, { store: "Albert Heijn", at: "2026-09-01T12:00:00+02:00", quantity: 1, unitPrice: 1.79 }),
      await confirmReceipt(supabase, productId, { store: "Hoogvliet", at: "2026-10-01T12:00:00+02:00", quantity: 2, unitPrice: 1.69, discount: 0.5 }),
      await confirmReceipt(supabase, productId, { store: "Albert Heijn", at: "2026-11-01T12:00:00+01:00", quantity: 1, unitPrice: 1.99 }),
    );
    await page.reload();

    const summary = page.getByTestId("price-summary");
    await expect(summary.getByRole("definition").filter({ hasText: "per L" }).first()).toHaveText(euro("€ 1,33 per L"));
    await expect(summary).toContainText(euro("Lowest you paid€ 0,96 per L")); // (3,38 − 0,50) ÷ 3 L
    await expect(summary).toContainText("Shelf price change+11.2%");
    await expect(summary).toContainText("Cheapest on averageHoogvliet");

    // The chart draws both lines, and hovering shows the purchase
    const chart = page.getByTestId("price-chart");
    await expect(chart.locator(".recharts-line")).toHaveCount(2);
    await expect(chart.getByText("What you paid (per L)")).toBeVisible();
    const box = (await chart.locator(".recharts-cartesian-grid").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chart.getByText("Hoogvliet")).toBeVisible();

    // The table lists each purchase, newest first
    const rows = page.getByTestId("price-table").locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("1 Nov 2026");
    await expect(rows.nth(1)).toContainText("(2×)");
    await expect(rows.nth(1)).toContainText("discount");
  });
});
