import { describe, expect, it } from "vitest";
import { allowance, DEFAULT_MONTHLY_READINGS, limitReachedMessage, monthName, startOfMonth } from "./readings";

describe("startOfMonth", () => {
  it("is midnight on the 1st in Amsterdam, in winter and in summer", () => {
    expect(startOfMonth(new Date("2026-11-13T10:00:00Z"))).toBe("2026-11-01T00:00:00+01:00");
    expect(startOfMonth(new Date("2026-07-15T10:00:00Z"))).toBe("2026-07-01T00:00:00+02:00");
  });

  it("counts the first hour of a month in Amsterdam as that month", () => {
    // 23:30 UTC on 30 Nov is 00:30 on 1 Dec in Amsterdam
    expect(startOfMonth(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01T00:00:00+01:00");
  });

  it("handles the month the clocks change", () => {
    // October starts in summer time; November in winter time
    expect(startOfMonth(new Date("2026-10-28T12:00:00Z"))).toBe("2026-10-01T00:00:00+02:00");
    expect(startOfMonth(new Date("2026-03-30T12:00:00Z"))).toBe("2026-03-01T00:00:00+01:00");
  });
});

describe("allowance", () => {
  it("gives the default to users without a limit of their own", () => {
    expect(allowance(3, undefined)).toEqual({ limit: DEFAULT_MONTHLY_READINGS, used: 3, left: DEFAULT_MONTHLY_READINGS - 3 });
  });

  it("uses a user's own limit, and never goes below zero", () => {
    expect(allowance(5, 50)).toEqual({ limit: 50, used: 5, left: 45 });
    expect(allowance(25, 20).left).toBe(0);
  });

  it("has no limit for the owner and the test account", () => {
    expect(allowance(500, null)).toEqual({ limit: null, used: 500, left: null });
  });
});

describe("messages", () => {
  const now = new Date("2026-11-13T10:00:00Z");

  it("names the month", () => {
    expect(monthName(now)).toBe("November 2026");
    expect(limitReachedMessage(20, now)).toBe(
      "You've used your 20 receipt readings for November 2026. Fill this one in from the photo, or upload it again next month.",
    );
  });
});
