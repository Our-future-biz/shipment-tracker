import { describe, expect, it } from "vitest";
import {
  ABSENCE_DAYS_BAD,
  ABSENCE_ENDS_BEFORE,
  ABSENCE_TOO_LONG,
  COVER_IS_ABSENT,
  COVER_NOT_USER,
  MAX_ABSENCE_DAYS,
  absenceDaysRefusal,
  absenceLength,
  coverRefusal,
  listSinceDefault,
  mayChangeAbsenceOf,
  overlapOf,
  overlapRefusal,
} from "../lib/absenceRules";

describe("who may record or change an absence", () => {
  it("is the user themself for their own, and a manager, an admin or a superadmin for anybody's", () => {
    expect(mayChangeAbsenceOf({ userID: "u-jan", role: "user" }, "u-jan")).toBe(true);
    expect(mayChangeAbsenceOf({ userID: "u-jan", role: "user" }, "U-JAN")).toBe(true);
    expect(mayChangeAbsenceOf({ userID: "u-jan", role: "user" }, "u-eva")).toBe(false);
    for (const role of ["manager", "admin", "superadmin"]) expect(mayChangeAbsenceOf({ userID: "u-boss", role }, "u-eva")).toBe(true);
  });
});

describe("the days of an absence", () => {
  it("are real days, the last not before the first, at most a year apart", () => {
    expect(absenceDaysRefusal("2026-11-23", "2026-11-27")).toBeNull();
    expect(absenceDaysRefusal("2026-11-23", "2026-11-23")).toBeNull();
    expect(absenceDaysRefusal("2026-11-27", "2026-11-23")).toBe(ABSENCE_ENDS_BEFORE);
    expect(absenceDaysRefusal("2026-02-30", "2026-03-02")).toBe(ABSENCE_DAYS_BAD);
    expect(absenceDaysRefusal("23.11.2026", "2026-11-27")).toBe(ABSENCE_DAYS_BAD);
    expect(absenceDaysRefusal("", "")).toBe(ABSENCE_DAYS_BAD);
    expect(absenceLength("2026-01-01", "2026-12-31")).toBe(365);
    expect(absenceDaysRefusal("2026-01-01", "2027-01-01")).toBeNull();
    expect(absenceLength("2026-01-01", "2027-01-01")).toBe(MAX_ABSENCE_DAYS);
    expect(absenceDaysRefusal("2026-01-01", "2027-01-02")).toBe(ABSENCE_TOO_LONG);
  });

  it("list from 30 days back by default", () => {
    expect(listSinceDefault("2026-11-18")).toBe("2026-10-19");
  });
});

describe("the cover", () => {
  it("is nobody, or another active user of the company", () => {
    expect(coverRefusal("u-jan", null, false)).toBeNull();
    expect(coverRefusal("u-jan", "u-eva", true)).toBeNull();
    expect(coverRefusal("u-jan", "U-JAN", true)).toBe(COVER_IS_ABSENT);
    expect(coverRefusal("u-jan", "u-left", false)).toBe(COVER_NOT_USER);
  });
});

describe("two absences of one user", () => {
  const spans = [
    { id: "a-1", fromDate: "2026-11-23", toDate: "2026-11-27" },
    { id: "a-2", fromDate: "2026-12-21", toDate: "2027-01-01" },
  ];

  it("never share a day", () => {
    expect(overlapOf(spans, "2026-11-27", "2026-11-30")).toEqual(spans[0]);
    expect(overlapOf(spans, "2026-11-01", "2026-12-31")).toEqual(spans[0]);
    expect(overlapOf(spans, "2026-12-31", "2027-01-05")).toEqual(spans[1]);
    expect(overlapOf(spans, "2026-11-28", "2026-12-20")).toBeNull();
    // An absence the day after another is no overlap.
    expect(overlapOf(spans, "2026-11-28", "2026-11-28")).toBeNull();
  });

  it("leave the absence itself out when it is changed", () => {
    expect(overlapOf(spans, "2026-11-20", "2026-11-25", "a-1")).toBeNull();
    expect(overlapOf(spans, "2026-11-20", "2026-12-22", "a-1")).toEqual(spans[1]);
  });

  it("are refused naming the one already there", () => {
    expect(overlapRefusal("Jan Novák", spans[0]!)).toBe("Jan Novák is already away 23.11.2026–27.11.2026: change that absence instead");
    expect(overlapRefusal("", spans[0]!)).toBe("This user is already away 23.11.2026–27.11.2026: change that absence instead");
  });
});
