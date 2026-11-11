import { expect, test } from "@playwright/test";

test.describe("Protected routes (signed out)", () => {
  test("GET /receipts redirects to /login and keeps the target", async ({ request }) => {
    const response = await request.get("/receipts", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    const location = new URL(response.headers()["location"], "http://localhost");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/receipts");
  });

  test("GET /login is public", async ({ request }) => {
    const response = await request.get("/login", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
  });
});