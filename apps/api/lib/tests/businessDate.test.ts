import { describe, expect, it } from "vitest";
import { addDays, businessDay, businessMinutes, isRealYmd } from "../businessDate";

describe("businessDay", () => {
  it("is the calendar day in Prague, not in UTC", () => {
    expect(businessDay(new Date("2026-10-10T12:00:00Z"))).toBe("2026-10-10");
    // 23:30 UTC is already half past midnight (winter) or half past one (summer) in Prague.
    expect(businessDay(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(businessDay(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
    expect(businessDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("changes exactly at midnight in Prague", () => {
    // Summer time: Prague is two hours ahead of UTC.
    expect(businessDay(new Date("2026-07-15T21:59:59Z"))).toBe("2026-07-15");
    expect(businessDay(new Date("2026-07-15T22:00:00Z"))).toBe("2026-07-16");
    // Winter time: one hour ahead.
    expect(businessDay(new Date("2026-01-15T22:59:59Z"))).toBe("2026-01-15");
    expect(businessDay(new Date("2026-01-15T23:00:00Z"))).toBe("2026-01-16");
  });
});

describe("addDays", () => {
  it("counts calendar days across months, years and leap days", () => {
    expect(addDays("2026-10-10", 15)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 15)).toBe("2026-11-09");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-10", 0)).toBe("2026-10-10");
  });

  it("is not thrown off by the clock change", () => {
    // 25 October 2026 is 25 hours long in Prague.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    // 29 March 2026 is 23 hours long.
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("goes back with a negative number", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-10", -3)).toBe("2026-10-07");
  });
});

describe("isRealYmd", () => {
  it("accepts days that exist", () => {
    expect(isRealYmd("2026-10-10")).toBe(true);
    expect(isRealYmd("2028-02-29")).toBe(true);
    expect(isRealYmd("2026-12-31")).toBe(true);
  });

  it("refuses days that do not exist", () => {
    expect(isRealYmd("2026-02-31")).toBe(false);
    expect(isRealYmd("2026-02-29")).toBe(false);
    expect(isRealYmd("2026-13-01")).toBe(false);
    expect(isRealYmd("2026-00-10")).toBe(false);
    expect(isRealYmd("2026-04-31")).toBe(false);
  });

  it("refuses anything not written as YYYY-MM-DD", () => {
    expect(isRealYmd("")).toBe(false);
    expect(isRealYmd("10.10.2026")).toBe(false);
    expect(isRealYmd("2026-10-10T00:00:00Z")).toBe(false);
    expect(isRealYmd("2026-1-5")).toBe(false);
    expect(isRealYmd(" 2026-10-10")).toBe(false);
    expect(isRealYmd("yesterday")).toBe(false);
  });
});

describe("businessMinutes", () => {
  it("is the time of day in Prague, summer and winter", () => {
    expect(businessMinutes(new Date("2026-07-15T12:30:00Z"))).toBe(14 * 60 + 30);
    expect(businessMinutes(new Date("2026-01-15T12:30:00Z"))).toBe(13 * 60 + 30);
    expect(businessMinutes(new Date("2026-01-15T23:00:00Z"))).toBe(0);
  });
});
