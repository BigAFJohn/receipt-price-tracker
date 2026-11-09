import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Supabase client for server components and route handlers.
 * Carries the signed-in user's session from cookies, so row level security
 * applies as that user. Returns null if Supabase is not configured.
 */
export async function createSupabaseServerClient() {
  // Read cookies first, even when unconfigured: this marks every caller as
  // request-time, so a missing key at build time is never frozen into a
  // prerendered page.
  const cookieStore = await cookies();

  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a server component, where cookies are read-only.
          // Session refresh will be handled by middleware in Phase 2.
        }
      },
    },
  });
}
