import { describe, expect, it } from "vitest";
import { addDays, businessDateTime, businessDay, businessDayOf, businessTime } from "./date";

describe("company-calendar dates and times (Prague)", () => {
  it("gives the Prague day of a moment, also just after midnight there", () => {
    // 23:30 UTC on 14 Oct is 01:30 on 15 Oct in Prague (CEST).
    expect(businessDay(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
    expect(businessDayOf("2026-10-14T23:30:00Z")).toBe("2026-10-15");
    expect(businessDayOf("")).toBe("");
    expect(businessDayOf("not a date")).toBe("");
  });

  it("gives the Prague time and date-time", () => {
    expect(businessTime("2026-10-14T23:30:00Z")).toBe("01:30");
    expect(businessTime("2026-01-14T12:05:00Z")).toBe("13:05");
    expect(businessDateTime("2026-10-14T23:30:00Z")).toBe("15.10.2026 01:30");
    expect(businessTime(null)).toBe("");
  });

  it("moves a day across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
