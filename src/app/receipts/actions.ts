"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ExtractionError, extractFromImage, type ExtractionResult } from "@/lib/extraction/extract";
import { amsterdamToIso } from "@/lib/extraction/normalize";
import { linesMatchTotal } from "@/lib/pricing";
import { matchProduct } from "@/lib/product-matching";
import { formatSize, type StoredUnit } from "@/lib/product-size";
import { cleanStoreName, findStore } from "@/lib/stores";
import { isOwnReceiptImagePath } from "@/lib/receipt-image";
import { ReceiptInputSchema, type ReceiptInput } from "@/lib/receipt-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { error: string | null };

type TrackedRow = { id: string; name: string; brand: string | null; size_value: number | null; size_unit: StoredUnit | null };

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Saves a draft receipt for a photo the browser has just uploaded to storage.
 * The path is checked against the signed-in user so a crafted request can't
 * attach someone else's file.
 */
export async function createDraftReceipt(
  imagePath: string,
): Promise<ActionResult & { receiptId: string | null }> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again.", receiptId: null };

  if (!isOwnReceiptImagePath(imagePath, user.id)) {
    return { error: "That upload could not be saved.", receiptId: null };
  }

  const { data, error } = await supabase
    .from("receipts")
    .insert({ image_path: imagePath, status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[receipts] insert failed:", error?.code, error?.message);
    // Don't leave an orphaned photo behind.
    await supabase.storage.from("receipts").remove([imagePath]);
    return { error: "The receipt could not be saved. Try again.", receiptId: null };
  }

  refresh();
  return { error: null, receiptId: data.id };
}

/**
 * Has Claude read a draft receipt's photo, and saves the store, date, total
 * and lines. The receipt stays a draft until you confirm it on the review
 * screen. Without `force`, a receipt that has already been read is left alone,
 * so opening its page twice never pays for a second reading.
 */
export async function extractReceipt(
  receiptId: string,
  options: { force?: boolean } = {},
): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  const { data: receipt } = await supabase
    .from("receipts")
    .select("id, image_path, status, extracted_at")
    .eq("id", receiptId)
    .maybeSingle();

  if (!receipt?.image_path) return { error: "Receipt not found." };
  if (receipt.status !== "draft") return { error: "Only drafts can be read again." };
  if (receipt.extracted_at && !options.force) return { error: null };

  const fail = async (message: string) => {
    await supabase.from("receipts").update({ extraction_error: message }).eq("id", receipt.id);
    refresh();
    return { error: message };
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return fail("Receipt reading isn't set up yet (ANTHROPIC_API_KEY is missing).");
  }

  const { data: photo, error: downloadError } = await supabase.storage
    .from("receipts")
    .download(receipt.image_path);
  if (downloadError || !photo) return fail("The photo could not be loaded. Try again.");

  const [{ data: stores }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from("stores").select("id, name").order("name"),
    supabase.from("categories").select("name").order("name"),
    supabase.from("products").select("id, name, brand, size_value, size_unit").order("name"),
  ]);
  const tracked = (products ?? []) as TrackedRow[];

  let result: ExtractionResult;
  try {
    result = await extractFromImage(Buffer.from(await photo.arrayBuffer()), {
      stores: (stores ?? []).map((s) => s.name),
      categories: (categories ?? []).map((c) => c.name),
      // So Claude recognises the products you already track.
      products: tracked.map((p) => ({
        name: p.name,
        brand: p.brand,
        size: p.size_value && p.size_unit ? formatSize(Number(p.size_value), p.size_unit) : null,
      })),
    });
  } catch (err) {
    console.error("[extract]", err);
    return fail(err instanceof ExtractionError ? err.message : "Claude could not read the receipt. Try again.");
  }

  if (!result.is_receipt) return fail("This photo doesn't look like a receipt.");

  const r = result.receipt;
  // A store you have, also when the receipt prints it differently ("AH");
  // a new one is offered on the review screen, from the name kept in `extraction`.
  const storeId = findStore(r.store, stores ?? [])?.id ?? null;

  // Update the receipt first: if it was deleted while Claude was reading, stop here.
  const { data: updated, error: updateError } = await supabase
    .from("receipts")
    .update({
      store_id: storeId,
      store_branch: r.store_branch,
      purchased_at: r.purchased_at,
      total: r.total,
      extracted_at: new Date().toISOString(),
      extraction_error: null,
      extraction: {
        model: result.model,
        usage: result.usage,
        totals_match: r.totals_match,
        store: r.store,
        raw: result.raw,
      },
    })
    .eq("id", receipt.id)
    .select("id");

  if (updateError) {
    console.error("[extract] update failed:", updateError.code, updateError.message);
    // Recorded on the receipt, so its page shows the form to fill in by hand.
    return fail("The reading could not be saved.");
  }
  if (!updated?.length) return { error: null };

  // What you matched before at this store, by receipt text.
  const { data: aliasRows } = storeId
    ? await supabase.from("product_aliases").select("raw_text, product_id").eq("store_id", storeId)
    : { data: [] };
  const aliases = new Map((aliasRows ?? []).map((a) => [a.raw_text, a.product_id]));

  await supabase.from("receipt_lines").delete().eq("receipt_id", receipt.id);
  const { error: linesError } = await supabase.from("receipt_lines").insert(
    r.lines.map((l) => ({
      receipt_id: receipt.id,
      line_no: l.line_no,
      raw_text: l.raw_text,
      sku: l.sku,
      quantity: l.quantity,
      is_weighed: l.is_weighed,
      unit_price: l.unit_price,
      line_total: l.line_total,
      discount: l.discount,
      is_deposit: l.is_deposit,
      confidence: l.confidence,
      product_id: matchProduct(l, aliases, tracked).productId,
      suggested_product: l.suggested_product,
    })),
  );

  if (linesError) {
    console.error("[extract] lines insert failed:", linesError.code, linesError.message);
    return fail("The receipt lines could not be saved. Try again.");
  }

  refresh();
  return { error: null };
}

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * The store to save on a receipt: the one chosen, or a new one by name.
 * A name you already have (also "JUMBO" for Jumbo) is reused, never added twice.
 */
async function storeFor(
  supabase: Supabase,
  chosen: { store_id: string | null; new_store_name: string | null },
): Promise<{ storeId: string | null; error: string | null }> {
  if (chosen.store_id || !chosen.new_store_name) return { storeId: chosen.store_id, error: null };

  const name = cleanStoreName(chosen.new_store_name);
  const existing = async () => {
    const { data } = await supabase.from("stores").select("id, name");
    return findStore(name, data ?? []);
  };

  const found = await existing();
  if (found) return { storeId: found.id, error: null };

  const { data: added, error } = await supabase.from("stores").insert({ name }).select("id").single();
  if (added) return { storeId: added.id, error: null };

  // Added at the same moment by another save: use that one.
  const now = error?.code === "23505" ? await existing() : null;
  if (now) return { storeId: now.id, error: null };
  console.error("[receipts] store insert failed:", error?.code, error?.message);
  return { storeId: null, error: "The new store could not be added. Try again." };
}

/**
 * Saves the reviewed store, date, total and lines. With `confirm`, also marks
 * the receipt confirmed, which needs the lines to add up to the total; the
 * database checks that rule as well, and saves everything or nothing.
 */
export async function saveReceipt(
  receiptId: string,
  input: ReceiptInput,
  options: { confirm: boolean },
): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  const parsed = ReceiptInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some fields aren't valid." };
  const data = parsed.data;

  if (options.confirm) {
    if (data.lines.length === 0) return { error: "Add at least one line before confirming." };
    const priced = data.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unit_price,
      lineTotal: l.line_total,
      discount: l.discount,
      isDeposit: l.is_deposit,
    }));
    if (!linesMatchTotal(priced, data.total)) {
      return { error: "The lines don't add up to the total yet." };
    }
  }

  const store = await storeFor(supabase, data);
  if (store.error) return { error: store.error };

  const { error } = await supabase.rpc("save_receipt", {
    p_receipt_id: receiptId,
    p_store_id: store.storeId,
    p_purchased_at: amsterdamToIso(data.date, data.time),
    p_total: data.total,
    p_lines: data.lines.map((l, i) => ({ line_no: i + 1, ...l })),
    p_confirm: options.confirm,
  });

  if (error) {
    console.error("[receipts] save failed:", error.code, error.message);
    if (error.code === "P0002") return { error: "This receipt can't be changed: it was confirmed or deleted." };
    if (error.code === "23514") return { error: "The lines don't add up to the total yet." };
    if (error.code === "23503") return { error: "One of the products no longer exists. Choose it again." };
    return { error: "The receipt could not be saved. Try again." };
  }

  if (options.confirm) redirect("/receipts");
  refresh();
  return { error: null };
}

/** Turns a confirmed receipt back into a draft so it can be corrected. */
export async function reopenReceipt(receiptId: string): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  const { data, error } = await supabase
    .from("receipts")
    .update({ status: "draft" })
    .eq("id", receiptId)
    .eq("status", "confirmed")
    .select("id");

  if (error || !data?.length) {
    if (error) console.error("[receipts] reopen failed:", error.code, error.message);
    return { error: "The receipt could not be reopened. Try again." };
  }

  refresh();
  return { error: null };
}

/** Deletes a draft receipt and its photo. Confirmed receipts are kept. */
export async function deleteDraftReceipt(receiptId: string): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  // RLS limits this to the user's own rows.
  const { data: receipt, error: findError } = await supabase
    .from("receipts")
    .select("id, image_path, status")
    .eq("id", receiptId)
    .maybeSingle();

  if (findError || !receipt) return { error: "Receipt not found." };
  if (receipt.status !== "draft") return { error: "Only drafts can be deleted." };

  const { error } = await supabase.from("receipts").delete().eq("id", receipt.id);
  if (error) {
    console.error("[receipts] delete failed:", error.code, error.message);
    return { error: "The receipt could not be deleted. Try again." };
  }

  if (receipt.image_path) {
    await supabase.storage.from("receipts").remove([receipt.image_path]);
  }

  refresh();
  return { error: null };
}
