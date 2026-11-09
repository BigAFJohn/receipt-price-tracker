import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";

const TEST_IMAGE = path.join(__dirname, "../fixtures/images/test-receipt.png");
/** A real receipt photo, kept out of the repo in samples/. */
const SAMPLE = "samples/hoogvliet-2026-11-08.jpg";

/** Reading a receipt takes several seconds; the new draft appears once it's done. */
const READ_TIMEOUT = 60_000;

test.describe("Receipt upload", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
  // These tests add and delete receipts in the same account, so they must not
  // run in parallel or they'd see each other's drafts.
  // Each test may wait up to READ_TIMEOUT for Claude, so allow more than the 30 s default.
  test.describe.configure({ mode: "default", timeout: READ_TIMEOUT + 30_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/receipts");
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByTestId("signed-in-as")).toBeVisible();
  });

  test("uploads a photo as a draft, then deletes it", async ({ page }) => {
    const items = page.getByTestId("receipt-item");
    const before = await items.count();

    await page.getByLabel("Receipt photo").setInputFiles(TEST_IMAGE);

    // Wait until reading has finished (successfully or not), then check the new draft.
    await expect(page.getByText("Add receipt photo")).toBeVisible({ timeout: READ_TIMEOUT });
    await expect(items).toHaveCount(before + 1, { timeout: READ_TIMEOUT });
    const newest = items.first();
    await expect(newest.getByText("Draft")).toBeVisible();
    await expect(newest.getByRole("img", { name: "Receipt photo" })).toBeVisible();

    // Clean up, so the test leaves your data as it found it.
    page.once("dialog", (dialog) => dialog.accept());
    await newest.getByRole("button", { name: "Delete" }).click();
    await expect(items).toHaveCount(before);
  });

  test("reads a real receipt with Claude", async ({ page }) => {
    // Calls the real Claude API, so it only runs when asked: E2E_EXTRACTION=1
    test.skip(process.env.E2E_EXTRACTION !== "1", "set E2E_EXTRACTION=1 to run");
    test.skip(!existsSync(SAMPLE), `needs ${SAMPLE}`);

    const items = page.getByTestId("receipt-item");
    const before = await items.count();

    await page.getByLabel("Receipt photo").setInputFiles(SAMPLE);
    await expect(items).toHaveCount(before + 1, { timeout: READ_TIMEOUT });
    const newest = items.first();

    await expect(newest.getByTestId("receipt-summary")).toContainText("Hoogvliet");
    await expect(newest.getByTestId("receipt-summary")).toContainText("2,87");
    await expect(newest.getByTestId("receipt-summary")).toContainText("2 items");
    await expect(newest.getByTestId("extraction-status")).toHaveText("Lines add up to the total");

    page.once("dialog", (dialog) => dialog.accept());
    await newest.getByRole("button", { name: "Delete" }).click();
    await expect(items).toHaveCount(before);
  });

  test("rejects a file that isn't a photo", async ({ page }) => {
    await page.getByLabel("Receipt photo").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a receipt"),
    });

    await expect(page.getByTestId("upload-error")).toHaveText("Choose a photo (JPEG, PNG or WebP).");
  });
});