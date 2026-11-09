"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type SignInState } from "./actions";
import styles from "./login.module.css";

const initialState: SignInState = { error: null };

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />

      <label className={styles.field}>
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" required />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      {state.error && (
        <p role="alert" className={styles.error} data-testid="login-error">
          {state.error}
        </p>
      )}

      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}