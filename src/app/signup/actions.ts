"use server";

import { redirect } from "next/navigation";
import { SignUpInputSchema, signUpErrorMessage } from "@/lib/signup-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * `values` refills the form after an error (React clears it on submit).
 * The password is never sent back to the browser.
 */
export type SignUpState = {
  error: string | null;
  checkEmail: boolean;
  values: { email: string; inviteCode: string; consent: boolean };
};

/**
 * Creates an account. The invite code travels as user metadata and is checked
 * inside Supabase (the "Before User Created" hook), so it can't be skipped by
 * calling Supabase directly.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? ""),
    consent: formData.get("consent") === "on",
  };
  const failed = (error: string): SignUpState => ({ error, checkEmail: false, values });

  const parsed = SignUpInputSchema.safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { email, password, inviteCode } = parsed.data;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return failed("Sign-up is not available: Supabase is not configured.");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { invite_code: inviteCode } },
  });

  if (error) {
    console.error("[signup] failed:", error.code, error.status, error.message);
    return failed(signUpErrorMessage(error));
  }

  // With "Confirm email" switched off in Supabase, the new user is signed in at once.
  if (data.session) redirect("/receipts");
  return { error: null, checkEmail: true, values };
}
