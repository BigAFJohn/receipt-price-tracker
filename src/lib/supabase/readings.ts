import type { SupabaseClient } from "@supabase/supabase-js";
import { allowance, startOfMonth, type Allowance } from "@/lib/readings";

/**
 * The signed-in user's Claude readings this month and their limit. Row level
 * security limits both tables to their own rows.
 */
export async function getAllowance(supabase: SupabaseClient): Promise<Allowance> {
  const [{ count }, { data: own }] = await Promise.all([
    supabase.from("readings").select("id", { count: "exact", head: true }).gte("read_at", startOfMonth()),
    supabase.from("reading_limits").select("monthly_readings").maybeSingle(),
  ]);
  return allowance(count ?? 0, own ? own.monthly_readings : undefined);
}
