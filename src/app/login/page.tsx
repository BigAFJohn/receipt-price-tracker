import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Sign in · Receipt Price Tracker",
};

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Sign in</h1>
      <p className={styles.lead}>Receipt Price Tracker</p>
      {/* The form reads ?next= from the URL, so it renders in the browser. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className={styles.switch}>
        Got an invite code? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
