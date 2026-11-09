import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Give the tests the same Supabase settings the app reads, so they know
// which path (configured or not) to expect.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "api", testMatch: /api\/.*\.spec\.ts/ },
    { name: "ui", testMatch: /ui\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  // Start the production build unless BASE_URL points at an already running app
  // (e.g. a Vercel preview deployment).
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run start -- --port ${PORT}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
