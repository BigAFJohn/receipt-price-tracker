import { z } from "zod";

/** The sign-up form, checked on the server before Supabase sees it. */
export const SignUpInputSchema = z.object({
  // Trimmed first, so a pasted address with a stray space still counts.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
  // Supabase stores at most 72 characters of a password.
  password: z
    .string()
    .min(8, "Choose a password of at least 8 characters")
    .max(72, "Keep the password under 72 characters"),
  inviteCode: z.string().trim().min(1, "Enter your invite code").max(64, "That invite code isn't valid."),
  consent: z.literal(true, { error: "Tick the box to confirm you've read how your receipts are used" }),
});

export type SignUpInput = z.input<typeof SignUpInputSchema>;

/** Supabase's sign-up errors, in words a new user can act on. */
export function signUpErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  const message = error.message ?? "";
  if (/invite code/i.test(message)) return "That invite code isn't valid.";
  if (error.code === "user_already_exists" || /already registered/i.test(message)) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (error.code === "signup_disabled" || /signups not allowed/i.test(message)) {
    return "Sign-up is closed right now.";
  }
  if (error.code === "weak_password") return "Choose a stronger password: longer, or with more kinds of characters.";
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Sign-up didn't work. Try again in a moment.";
}
