/**
 * Product sizes. The database keeps three units, so unit prices compare
 * like with like: litres, kilos and pieces. People type ml and g as well;
 * those are converted on the way in and shown again on the way out.
 */

export const SIZE_UNITS = ["ml", "L", "g", "kg", "pcs"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];
export type StoredUnit = "L" | "kg" | "pcs";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** 330 ml → { size_value: 0.33, size_unit: "L" }; 500 g → 0.5 kg; 6 pcs stays 6 pcs. */
export function toStoredSize(value: number, unit: SizeUnit): { size_value: number; size_unit: StoredUnit } {
  if (unit === "ml") return { size_value: round3(value / 1000), size_unit: "L" };
  if (unit === "g") return { size_value: round3(value / 1000), size_unit: "kg" };
  return { size_value: round3(value), size_unit: unit };
}

/** The other way, for the edit form: 0.33 L → 330 ml, 0.5 kg → 500 g, 1.5 L stays 1.5 L. */
export function toInputSize(value: number, unit: StoredUnit): { value: number; unit: SizeUnit } {
  if (unit === "L" && value < 1) return { value: Math.round(value * 1000), unit: "ml" };
  if (unit === "kg" && value < 1) return { value: Math.round(value * 1000), unit: "g" };
  return { value, unit };
}

const number = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 });

/** "1,5 L", "330 ml", "500 g", "6 pcs" — written the way Dutch packs and receipts write them. */
export function formatSize(value: number, unit: StoredUnit): string {
  const shown = toInputSize(value, unit);
  return `${number.format(shown.value)} ${shown.unit}`;
}

/** What a unit price is per: "per L", "per kg", "per piece". */
export function perUnitLabel(unit: StoredUnit): string {
  return unit === "pcs" ? "per piece" : `per ${unit}`;
}