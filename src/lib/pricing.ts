export type SizeUnit = "L" | "kg" | "pcs";

export interface PricedLine {
  quantity: number;
  unitPrice: number; // shelf price per item, before discount
  lineTotal: number;
  discount: number;
  isDeposit: boolean;
}

export interface ProductSize {
  sizeValue: number;
  sizeUnit: SizeUnit;
}

/** Rounds to 4 decimals, matching the price_history view in the database. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Shelf price per unit of measure (€/L, €/kg, €/piece), ignoring discounts.
 * Returns null for deposit lines or products without a usable size.
 */
export function shelfUnitPrice(line: PricedLine, size: ProductSize): number | null {
  if (line.isDeposit || !(size.sizeValue > 0)) return null;
  return round4(line.unitPrice / size.sizeValue);
}

/**
 * What you actually paid per unit of measure, after discounts
 * (Bonus, 1+1 gratis, etc.). Returns null for deposit lines or
 * products without a usable size.
 */
export function effectiveUnitPrice(line: PricedLine, size: ProductSize): number | null {
  if (line.isDeposit || !(size.sizeValue > 0) || !(line.quantity > 0)) return null;
  return round4((line.lineTotal - line.discount) / (line.quantity * size.sizeValue));
}

/**
 * Checks that the receipt lines add up to the printed total, within a
 * tolerance of one cent per line to absorb rounding on the receipt.
 */
export function linesMatchTotal(lines: PricedLine[], total: number): boolean {
  const sum = lines.reduce((acc, l) => acc + l.lineTotal - l.discount, 0);
  const tolerance = 0.01 * Math.max(1, lines.length);
  return Math.abs(sum - total) <= tolerance;
}
