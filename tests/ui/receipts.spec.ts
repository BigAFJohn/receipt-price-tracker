import { expect, test } from "@playwright/test";
import path from "node:path";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";

const TEST_IMAGE = path.join(__dirname, "../fixtures/images/test-receipt.png");

test.describe("Receipt upload", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/receipts");
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByTestId("signed-in-as")).toBeVisible();
  });

  test("uploads a photo as a draft, then deletes it", async ({ page }) => {
    const items = page.getByTestId("receipt-item");
    const before = await items.count();

    await page.getByLabel("Receipt photo").setInputFiles(TEST_IMAGE);

    await expect(items).toHaveCount(before + 1);
    const newest = items.first();
    await expect(newest.getByText("Draft")).toBeVisible();
    await expect(newest.getByRole("img", { name: "Receipt photo" })).toBeVisible();

    // Clean up, so the test leaves your data as it found it.
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