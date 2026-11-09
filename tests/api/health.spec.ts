import { expect, test } from "@playwright/test";
import { SEEDED_STORES, supabaseConfigured } from "../expected";

test.describe("GET /api/health", () => {
  test("responds with JSON and a known status", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.headers()["content-type"]).toContain("application/json");
    const body = await response.json();
    expect(["ok", "degraded"]).toContain(body.status);
    expect(["ok", "not_configured", "error"]).toContain(body.database);
  });

  test("reports not_configured when Supabase keys are missing", async ({ request }) => {
    test.skip(supabaseConfigured, "Supabase is configured");

    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "degraded", database: "not_configured" });
  });

  test("returns the seeded stores when connected", async ({ request }) => {
    test.skip(!supabaseConfigured, "Supabase keys not set");

    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", database: "ok" });
    expect(body.stores).toEqual(expect.arrayContaining(SEEDED_STORES));
  });
});
