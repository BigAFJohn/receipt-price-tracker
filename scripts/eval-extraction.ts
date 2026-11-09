/**
 * Scores Claude's receipt reading against the golden receipts.
 *
 *   npm run eval:extraction                              # default model (Haiku)
 *   EXTRACTION_MODEL=claude-sonnet-5-5 npm run eval:extraction
 *
 * Each tests/fixtures/receipts/<name>.json is paired with a photo
 * samples/<name>.jpg (or .jpeg / .png / .webp). Photos are resized exactly as
 * the app does, so the score reflects what happens in production.
 * Calls the real API: costs a little per receipt.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import { DEFAULT_EXTRACTION_MODEL, extractFromImage } from "../src/lib/extraction/extract";
import { scoreExtraction, type GoldenReceipt } from "../src/lib/extraction/score";
import { MAX_EDGE_PX } from "../src/lib/receipt-image";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set (add it to .env.local).");
  process.exit(1);
}

const FIXTURES = "tests/fixtures/receipts";
const SAMPLES = "samples";
const model = process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;

function findPhoto(name: string) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const path = join(SAMPLES, name + ext);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Same as the browser: longest edge 1600 px, JPEG quality 85, rotated upright, no metadata. */
async function prepare(path: string) {
  return sharp(path)
    .rotate()
    .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function main() {
  console.log(`Model: ${model}\n`);
  let passed = 0;
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort()) {
    const name = basename(file, ".json");
    const photo = findPhoto(name);
    if (!photo) {
      console.log(`– ${name}: skipped (no photo at ${SAMPLES}/${name}.jpg)`);
      continue;
    }

    const golden = JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as GoldenReceipt;
    const started = Date.now();
    try {
      const result = await extractFromImage(await prepare(photo), { model });
      const score = scoreExtraction(golden, result.receipt);
      passed += score.passed;
      total += score.total;
      inputTokens += result.usage.input_tokens;
      outputTokens += result.usage.output_tokens;

      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const mark = score.percent === 100 ? "✓" : "✗";
      console.log(`${mark} ${name}: ${score.percent}% (${score.passed}/${score.total}) in ${seconds}s`);
      if (!result.receipt.totals_match) console.log("    ! lines don't add up to the total");
      for (const c of score.checks.filter((c) => !c.ok)) {
        console.log(`    ${c.field}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`);
      }
    } catch (err) {
      console.log(`✗ ${name}: failed — ${err instanceof Error ? err.message : err}`);
    }
  }

  if (total === 0) {
    console.log("\nNo receipts scored. Name each photo after its fixture, e.g. samples/ah-lunetten-2026-11-08.jpg");
    process.exit(1);
  }

  console.log(`\nOverall: ${Math.round((passed / total) * 1000) / 10}% (${passed}/${total} checks)`);
  console.log(`Tokens: ${inputTokens} in, ${outputTokens} out`);
}

main();