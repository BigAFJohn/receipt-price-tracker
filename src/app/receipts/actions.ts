"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ExtractionError, extractFromImage, type ExtractionResult } from "@/lib/extraction/extract";
import { amsterdamToIso } from "@/lib/extraction/normalize";
import { linesMatchTotal } from "@/lib/pricing";
import { isOwnReceiptImagePath } from "@/lib/receipt-image";
import { ReceiptInputSchema, type ReceiptInput } from "@/lib/receipt-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult = { error: string | null };

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

  const { data: stores } = await supabase.from("stores").select("id, name");
  const storeNames = (stores ?? []).map((s) => s.name);

  let result: ExtractionResult;
  try {
    result = await extractFromImage(Buffer.from(await photo.arrayBuffer()), { stores: storeNames });
  } catch (err) {
    console.error("[extract]", err);
    return fail(err instanceof ExtractionError ? err.message : "Claude could not read the receipt. Try again.");
  }

  if (!result.is_receipt) return fail("This photo doesn't look like a receipt.");

  const r = result.receipt;
  const storeId = stores?.find((s) => s.name === r.store)?.id ?? null;

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
    })),
  );

  if (linesError) {
    console.error("[extract] lines insert failed:", linesError.code, linesError.message);
    return fail("The receipt lines could not be saved. Try again.");
  }

  refresh();
  return { error: null };
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

  const { error } = await supabase.rpc("save_receipt", {
    p_receipt_id: receiptId,
    p_store_id: data.store_id,
    p_purchased_at: amsterdamToIso(data.date, data.time),
    p_total: data.total,
    p_lines: data.lines.map((l, i) => ({ line_no: i + 1, ...l })),
    p_confirm: options.confirm,
  });

  if (error) {
    console.error("[receipts] save failed:", error.code, error.message);
    if (error.code === "P0002") return { error: "This receipt can't be changed: it was confirmed or deleted." };
    if (error.code === "23514") return { error: "The lines don't add up to the total yet." };
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