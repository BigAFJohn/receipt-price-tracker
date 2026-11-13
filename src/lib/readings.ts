/**
 * The monthly limit on Claude readings. Every reading is paid from the app
 * owner's Anthropic account, so invited users get a set number per calendar
 * month (Amsterdam time); the owner and the test account have no limit.
 */

/** Readings a month for users without a limit of their own (reading_limits). */
export const DEFAULT_MONTHLY_READINGS = 20;

/** The first moment of this month on an Amsterdam calendar, as an ISO timestamp. */
export function startOfMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);

  // Midnight on the 1st in Amsterdam: try +01:00 (winter), else +02:00 (summer).
  for (const offset of ["+01:00", "+02:00"]) {
    const iso = `${y}-${String(m).padStart(2, "0")}-01T00:00:00${offset}`;
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23" })
      .format(new Date(iso));
    if (hour === "00") return iso;
  }
  throw new Error("could not place the start of the month");
}

/** "November 2026" for the month `now` falls in, in Amsterdam. */
export function monthName(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(now);
}

export type Allowance = {
  /** null = no limit. */
  limit: number | null;
  used: number;
  /** null = no limit. */
  left: number | null;
};

/**
 * What's left this month. `ownLimit` is the user's row in reading_limits:
 * undefined when they have none (the default applies), null for no limit.
 */
export function allowance(used: number, ownLimit: number | null | undefined): Allowance {
  const limit = ownLimit === undefined ? DEFAULT_MONTHLY_READINGS : ownLimit;
  return { limit, used, left: limit === null ? null : Math.max(0, limit - used) };
}

/** Shown when the month's readings are used up; the receipt can still be filled in by hand. */
export function limitReachedMessage(limit: number, now = new Date()): string {
  return `You've used your ${limit} receipt readings for ${monthName(now)}. Fill this one in from the photo, or upload it again next month.`;
}