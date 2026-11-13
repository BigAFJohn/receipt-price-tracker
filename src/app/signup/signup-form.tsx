"use client";

import { useActionState } from "react";
import { DEFAULT_MONTHLY_READINGS } from "@/lib/readings";
import styles from "../login/login.module.css";
import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = {
  error: null,
  checkEmail: false,
  values: { email: "", inviteCode: "", consent: false },
};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.checkEmail) {
    return (
      <p role="status" className={styles.notice} data-testid="signup-check-email">
        Account created. Check your email for a link to confirm it, then sign in.
      </p>
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <label className={styles.field}>
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" defaultValue={state.values.email} required />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <input type="password" name="password" autoComplete="new-password" minLength={8} required />
      </label>
      <p className={styles.hint}>At least 8 characters.</p>

      <label className={styles.field}>
        <span>Invite code</span>
        <input
          name="inviteCode"
          autoComplete="off"
          autoCapitalize="characters"
          defaultValue={state.values.inviteCode}
          required
        />
      </label>

      <div className={styles.notice} data-testid="signup-privacy">
        <p className={styles.hint}>
          This is a personal project in testing. Claude reads the receipts you upload, up to{" "}
          {DEFAULT_MONTHLY_READINGS} a month. The app&apos;s owner can see your receipts, including the photos,
          which may show part of your card number or loyalty card. Upload only receipts you&apos;re happy to share.
        </p>
      </div>

      <label className={styles.check}>
        <input type="checkbox" name="consent" defaultChecked={state.values.consent} required />
        <span>I understand the app&apos;s owner can see the receipts I upload.</span>
      </label>

      {state.error && (
        <p role="alert" className={styles.error} data-testid="signup-error">
          {state.error}
        </p>
      )}

      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
