import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { normalizeExtraction, type NormalizedReceipt } from "./normalize";
import { EXTRACTION_PROMPT } from "./prompt";
import { buildExtractionSchema, KNOWN_STORES, type ExtractedReceipt } from "./schema";

/** Haiku is built for extraction and is the cheapest model; override with EXTRACTION_MODEL. */
export const DEFAULT_EXTRACTION_MODEL = "claude-haiku-5-5";

export class ExtractionError extends Error {}

export type ExtractionResult = {
  model: string;
  is_receipt: boolean;
  raw: ExtractedReceipt;
  receipt: NormalizedReceipt;
  usage: { input_tokens: number; output_tokens: number };
};

/** The part of the SDK client we use, so tests can pass a stand-in. */
export type MessagesClient = Pick<Anthropic, "messages">;

/**
 * Sends one receipt photo (a JPEG) to Claude and returns the cleaned-up result.
 * No database or Next.js code here, so the evaluation script can use it too.
 */
export async function extractFromImage(
  jpeg: Buffer | Uint8Array,
  options: { stores?: string[]; model?: string; client?: MessagesClient } = {},
): Promise<ExtractionResult> {
  const model = options.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
  const client = options.client ?? new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const schema = buildExtractionSchema(options.stores ?? KNOWN_STORES);

  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(jpeg).toString("base64") },
          },
          { type: "text", text: "Read this receipt." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("Claude declined to read this image.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("The receipt was too long to read in one go.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("Claude's answer could not be read.");
  }

  const raw = response.parsed_output;
  return {
    model,
    is_receipt: raw.is_receipt,
    raw,
    receipt: normalizeExtraction(raw),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}