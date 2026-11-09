import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type HealthResponse = {
  status: "ok" | "degraded";
  database: "ok" | "not_configured" | "error";
  stores?: string[];
};

/**
 * GET /api/health
 * Reports whether the app is up and can reach Supabase.
 * Used by the Playwright API tests and as a quick check after deploys.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json<HealthResponse>({ status: "degraded", database: "not_configured" });
  }

  const { data, error } = await supabase.from("stores").select("name").order("name");

  if (error) {
    return NextResponse.json<HealthResponse>({ status: "degraded", database: "error" }, { status: 503 });
  }

  return NextResponse.json<HealthResponse>({
    status: "ok",
    database: "ok",
    stores: data.map((s) => s.name),
  });
}
