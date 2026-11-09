"use server";

import { refresh } from "next/cache";
import { isOwnReceiptImagePath } from "@/lib/receipt-image";
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
export async function createDraftReceipt(imagePath: string): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!supabase || !user) return { error: "You are signed out. Sign in and try again." };

  if (!isOwnReceiptImagePath(imagePath, user.id)) {
    return { error: "That upload could not be saved." };
  }

  const { error } = await supabase.from("receipts").insert({ image_path: imagePath, status: "draft" });
  if (error) {
    console.error("[receipts] insert failed:", error.code, error.message);
    // Don't leave an orphaned photo behind.
    await supabase.storage.from("receipts").remove([imagePath]);
    return { error: "The receipt could not be saved. Try again." };
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