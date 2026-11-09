/**
 * Public Supabase settings. Both values are safe to expose to the browser:
 * access to personal data is enforced by row level security, not by the key.
 * Returns null when the app has not been configured yet, so the app can show
 * a setup message instead of crashing.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
