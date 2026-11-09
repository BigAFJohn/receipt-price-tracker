/** The stores seeded by supabase/seed.sql. */
export const SEEDED_STORES = ["Albert Heijn", "Hoogvliet", "Kruidvat", "Action"];

/**
 * True when the app under test has Supabase keys. CI on a public repo runs
 * without secrets, so tests check the "not configured" path there and the
 * full path locally or against a deployment.
 */
export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Your real login, for the sign-in test. Set in .env.local only — never in CI
 * or the repo. When missing, the test that needs it is skipped.
 */
export const testUser =
  supabaseConfigured && process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD
    ? { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD }
    : null;
