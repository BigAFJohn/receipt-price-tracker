"use server";

import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Sign-in is not available: Supabase is not configured." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Same message for a wrong email or a wrong password.
    return { error: "Email or password is incorrect." };
  }

  redirect(next);
}

 export async function signOut() {
   const supabase = await createSupabaseServerClient();
    // "local" ends this browser's session only. Supabase's default ("global")
    // would also sign you out on every other device.
   await supabase?.auth.signOut({ scope: "local" });
   redirect("/login");
 }