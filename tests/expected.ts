/** The stores seeded by supabase/seed.sql. */
export const SEEDED_STORES = ["Albert Heijn", "Hoogvliet", "Kruidvat", "Action"];

/**
 * True when the app under test has Supabase keys. CI on a public repo runs
 * without secrets, so tests check the "not configured" path there and the
 * full path locally or against a deployment.
 */
export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
