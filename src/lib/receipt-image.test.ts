import { describe, expect, it } from "vitest";
import {
  fitWithin,
  isOwnReceiptImagePath,
  receiptImagePath,
  validateReceiptFile,
} from "./receipt-image";

const MB = 1024 * 1024;
const user = "266f944d-eeaf-49f8-85c6-fdad8f6940a2";
const other = "11111111-1111-1111-1111-111111111111";
const id = "0b6a7a2e-4c1d-4f0e-9b7a-2d3c4e5f6a7b";

describe("validateReceiptFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(validateReceiptFile({ type, size: 3 * MB })).toBeNull();
  });

  it.each(["image/heic", "application/pdf", "text/plain", ""])("rejects %s", (type) => {
    expect(validateReceiptFile({ type, size: 1 * MB })).toMatch(/Choose a photo/);
  });

  it("rejects files over 20 MB", () => {
    expect(validateReceiptFile({ type: "image/jpeg", size: 21 * MB })).toMatch(/too large/);
  });
});

describe("fitWithin", () => {
  it("scales a tall receipt photo down to 1600 px high", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges a small image", () => {
    expect(fitWithin(800, 1200)).toEqual({ width: 800, height: 1200 });
  });
});

describe("receipt image paths", () => {
  it("puts the photo in the user's own folder", () => {
    expect(receiptImagePath(user, id)).toBe(`${user}/${id}.jpg`);
  });

  it("accepts the user's own path", () => {
    expect(isOwnReceiptImagePath(`${user}/${id}.jpg`, user)).toBe(true);
  });

  it.each([
    [`${other}/${id}.jpg`, "another user's folder"],
    [`${user}/../${other}/${id}.jpg`, "path traversal"],
    [`${user}/${id}.png`, "wrong extension"],
    [`${user}/not-a-uuid.jpg`, "not a uuid"],
    [`${user}/${id}.jpg/extra`, "trailing segment"],
  ])("rejects %s (%s)", (path) => {
    expect(isOwnReceiptImagePath(path, user)).toBe(false);
  });
});