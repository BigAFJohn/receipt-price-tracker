import type { Metadata } from "next";
import Link from "next/link";
import styles from "../login/login.module.css";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up · Receipt Price Tracker",
};

export default function SignUpPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Sign up</h1>
      <p className={styles.lead}>Receipt Price Tracker is invite-only for now.</p>
      <SignUpForm />
      <p className={styles.switch}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
