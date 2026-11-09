import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser. Uses the session cookies set at sign-in,
 * so storage uploads run as the signed-in user and row level security applies.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase is not configured.");
  return createBrowserClient(url, anonKey);
}