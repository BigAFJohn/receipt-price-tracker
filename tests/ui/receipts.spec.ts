import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { testUser } from "../expected";
import { signIn } from "../helpers/auth";

const TEST_IMAGE = path.join(__dirname, "../fixtures/images/test-receipt.png");
/** A real receipt photo, kept out of the repo in samples/. */
const SAMPLE = "samples/hoogvliet-2026-11-08.jpg";

/** Reading a receipt takes several seconds. */
const READ_TIMEOUT = 60_000;
const REVIEW_URL = /\/receipts\/([0-9a-f-]{36})$/;

/** Uploads a photo and returns the new receipt's id, read from its review page address. */
async function upload(page: Page, file: string): Promise<string> {
  await page.getByLabel("Receipt photo").setInputFiles(file);
  await expect(page).toHaveURL(REVIEW_URL, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Review receipt" })).toBeVisible();
  return REVIEW_URL.exec(page.url())![1];
}

/** Waits until the receipt has been read (successfully or not). */
async function waitForReading(page: Page) {
  await expect(page.getByTestId("reading")).toBeHidden({ timeout: READ_TIMEOUT });
}

/** Deletes the draft open on the page and checks it's gone from the list. */
async function deleteDraft(page: Page, id: string) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(/\/receipts$/);
  await expect(page.locator(`[data-receipt-id="${id}"]`)).toHaveCount(0);
}

test.describe("Receipts", () => {
  test.skip(!testUser, "TEST_USER_EMAIL / TEST_USER_PASSWORD not set");
  // Each test may wait up to READ_TIMEOUT for Claude, so allow more than the 30 s default.
  // Tests find their own receipt by id, so receipts added by other tests don't matter.
  test.describe.configure({ timeout: READ_TIMEOUT + 30_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/receipts");
    await signIn(page, testUser!.email, testUser!.password);
    await expect(page.getByTestId("signed-in-as")).toBeVisible();
  });

    test("uploading opens the receipt for review; deleting the draft returns to the list", async ({ page }) => {
    const id = await upload(page, TEST_IMAGE);
    await expect(page.getByRole("img", { name: "Receipt photo" })).toBeVisible();

    await waitForReading(page);
    // Whatever Claude makes of the test image, the draft can be reviewed.
    await expect(page.getByTestId("review-form")).toBeVisible();

    // Going back to the list, the upload button is ready for the next receipt.
    await page.goBack();
    await expect(page).toHaveURL(/\/receipts$/);
    await expect(page.getByText("Add receipt photo")).toBeVisible();
    await expect(page.getByLabel("Receipt photo")).toBeEnabled();
    await page.locator(`[data-receipt-id="${id}"]`).getByRole("link").click();
    await expect(page).toHaveURL(REVIEW_URL);

    await deleteDraft(page, id);
  });

  test("reviews, corrects and confirms a real receipt", async ({ page }) => {
    // Calls the real Claude API, so it only runs when asked: E2E_EXTRACTION=1
    test.skip(process.env.E2E_EXTRACTION !== "1", "set E2E_EXTRACTION=1 to run");
    test.skip(!existsSync(SAMPLE), `needs ${SAMPLE}`);

    const id = await upload(page, SAMPLE);
    await waitForReading(page);

    // What Claude read
    await expect(page.getByTestId("line-row")).toHaveCount(2);
    await expect(page.getByLabel("Store").locator("option:checked")).toHaveText("Hoogvliet");
    await expect(page.getByLabel("Total paid (€)")).toHaveValue("2.87");
    await expect(page.getByTestId("totals-check")).toContainText("Lines add up to the total");

    // A wrong quantity recalculates the line, breaks the totals check and blocks confirming
    const quantity = page.getByLabel("Quantity, line 1");
    await quantity.fill("3");
    await expect(page.getByLabel("Line total, line 1")).toHaveValue("1.44");
    await expect(page.getByTestId("totals-check")).toContainText("difference");
    await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeDisabled();

    await quantity.fill("2");
    await expect(page.getByTestId("totals-check")).toContainText("Lines add up to the total");

    // A saved draft keeps its edits
    await page.getByLabel("Description, line 2").fill("APPELSIENTJE MULTI 1L");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status")).toHaveText("Draft saved.");
    await page.reload();
    await expect(page.getByLabel("Description, line 2")).toHaveValue("APPELSIENTJE MULTI 1L");

    // Confirming returns to the list
    await page.getByRole("button", { name: "Confirm receipt" }).click();
    await expect(page).toHaveURL(/\/receipts$/);
    const item = page.locator(`[data-receipt-id="${id}"]`);
    await expect(item).toContainText("Confirmed");
    await expect(item).toContainText("Hoogvliet");

    // A confirmed receipt can be reopened, then deleted as a draft
    await item.getByRole("link").click();
    await expect(page.getByTestId("confirmed-summary")).toContainText("Hoogvliet");
    await page.getByRole("button", { name: "Reopen for editing" }).click();
    await expect(page.getByTestId("review-form")).toBeVisible();
    await deleteDraft(page, id);
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