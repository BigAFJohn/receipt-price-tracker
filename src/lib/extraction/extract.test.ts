import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXTRACTION_MODEL,
  ExtractionError,
  extractFromImage,
  receiptRequestText,
  type MessagesClient,
} from "./extract";
import type { ExtractedReceipt } from "./schema";

const parsed: ExtractedReceipt = {
  is_receipt: true,
  store: "Hoogvliet",
  store_branch: null,
  purchase_date: "2026-11-08",
  purchase_time: "14:18",
  total: 2.87,
  lines: [
    {
      raw_text: "HOOGVLIET CROISSANT", sku: null, quantity: 2, is_weighed: false, unit_price: 0.48, line_total: 0.96, discount: 0, is_deposit: false, confidence: 0.98,
      product: { name: "Croissant", existing: true, brand: "Hoogvliet", size_value: 1, size_unit: "pcs", category: "Bread & bakery" },
    },
    { raw_text: "APPELSIENTJE MULTI", sku: null, quantity: 1, is_weighed: false, unit_price: 1.91, line_total: 1.91, discount: 0, is_deposit: false, confidence: 0.97, product: null },
  ],
};

/** A stand-in for the Anthropic client that returns a fixed answer. */
function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue({
    stop_reason: "end_turn",
    usage: { input_tokens: 1500, output_tokens: 300 },
    ...response,
  });
  return { client: { messages: { parse } } as unknown as MessagesClient, parse };
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("extractFromImage", () => {
  it("sends the photo as a base64 JPEG to the default model", async () => {
    const { client, parse } = fakeClient({ parsed_output: parsed });

    await extractFromImage(jpeg, { client });

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_EXTRACTION_MODEL);
    expect(request.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
    });
    expect(request.output_config.format.type).toBe("json_schema");
  });

  it("returns the cleaned-up receipt and token usage", async () => {
    const { client } = fakeClient({ parsed_output: parsed });

    const result = await extractFromImage(jpeg, { client, model: "claude-sonnet-5-5" });

    expect(result.model).toBe("claude-sonnet-5-5");
    expect(result.receipt.purchased_at).toBe("2026-11-08T14:18:00+01:00");
    expect(result.receipt.totals_match).toBe(true);
    expect(result.usage).toEqual({ input_tokens: 1500, output_tokens: 300 });
  });

  it("tells Claude which products you already track", async () => {
    const { client, parse } = fakeClient({ parsed_output: parsed });

    await extractFromImage(jpeg, { client, products: [{ name: "Croissant", brand: "Hoogvliet", size: "1 pcs" }] });

    expect(parse.mock.calls[0][0].messages[0].content[1].text).toContain("- Croissant · Hoogvliet · 1 pcs");
  });

  it("keeps Claude's product suggestion on each line", async () => {
    const { client } = fakeClient({ parsed_output: parsed });

    const result = await extractFromImage(jpeg, { client });

    expect(result.receipt.lines[0].suggested_product).toMatchObject({ name: "Croissant", existing: true });
    expect(result.receipt.lines[1].suggested_product).toBeNull();
  });

  it.each([
    ["refusal", /declined/],
    ["max_tokens", /too long/],
  ])("fails clearly when Claude stops with %s", async (stop_reason, message) => {
    const { client } = fakeClient({ stop_reason, parsed_output: null });

    await expect(extractFromImage(jpeg, { client })).rejects.toThrow(message);
    await expect(extractFromImage(jpeg, { client })).rejects.toBeInstanceOf(ExtractionError);
  });
});

describe("receiptRequestText", () => {
  it("lists tracked products, leaving out what isn't known", () => {
    expect(
      receiptRequestText([
        { name: "Coca-Cola Zero", brand: "Coca-Cola", size: "1,5 L" },
        { name: "Bananen", brand: null, size: null },
      ]),
    ).toBe(
      "Read this receipt.\n\nProducts already tracked (name · brand · size):\n- Coca-Cola Zero · Coca-Cola · 1,5 L\n- Bananen",
    );
  });

  it("says so when nothing is tracked yet", () => {
    expect(receiptRequestText([])).toBe("Read this receipt. No products are tracked yet.");
  });
});
