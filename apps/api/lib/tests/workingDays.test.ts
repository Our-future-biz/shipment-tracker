import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  easterSunday,
  effectiveStartDate,
  isCzechHoliday,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
} from "../workingDays";

describe("Czech public holidays", () => {
  it("finds Easter and its Good Friday and Easter Monday", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    for (const d of ["2026-04-03", "2026-04-06", "2027-03-26", "2027-03-29"]) expect(isCzechHoliday(d)).toBe(true);
    expect(isCzechHoliday("2026-04-05")).toBe(false); // Easter Sunday is a Sunday anyway, not a holiday by law
    expect(isCzechHoliday("2027-04-02")).toBe(false);
  });

  it("knows every fixed date of the law", () => {
    for (const md of ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"]) {
      expect(isCzechHoliday(`2026-${md}`)).toBe(true);
    }
    expect(isCzechHoliday("2026-12-27")).toBe(false);
  });
});

describe("isWorkingDay", () => {
  it("is a weekday that is not a holiday", () => {
    expect(isWorkingDay("2026-10-14")).toBe(true); // Wednesday
    expect(isWorkingDay("2026-10-17")).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-28")).toBe(false); // holiday
  });

  it("treats extra holidays as non-working", () => {
    expect(isWorkingDay("2026-10-15", ["2026-10-15"])).toBe(false);
    expect(nextWorkingDay("2026-10-14", ["2026-10-15"])).toBe("2026-10-16");
  });
});

describe("addWorkingDays", () => {
  it("skips 24-26 December and the weekend after it", () => {
    // 2026: 24 Thu, 25 Fri, 26 Sat, 27 Sun.
    expect(addWorkingDays("2026-12-23", 1)).toBe("2026-12-28");
    expect(addWorkingDays("2026-12-23", 2)).toBe("2026-12-29");
    expect(addWorkingDays("2026-12-23", 3)).toBe("2026-12-30");
    expect(addWorkingDays("2026-12-23", 4)).toBe("2026-12-31");
    expect(addWorkingDays("2026-12-23", 5)).toBe("2027-01-04"); // 1 Jan holiday, then the weekend
    // 2027: Christmas falls on Friday to Sunday.
    expect(addWorkingDays("2027-12-23", 1)).toBe("2027-12-27");
  });

  it("skips Good Friday and Easter Monday", () => {
    expect(addWorkingDays("2026-04-02", 1)).toBe("2026-04-07");
    expect(addWorkingDays("2026-04-02", 2)).toBe("2026-04-08");
    expect(addWorkingDays("2026-04-02", 3)).toBe("2026-04-09");
    expect(addWorkingDays("2026-04-02", 4)).toBe("2026-04-10");
    expect(addWorkingDays("2027-03-25", 1)).toBe("2027-03-30");
  });

  it("with n = 0 keeps a working day and rolls a non-working one forward", () => {
    expect(addWorkingDays("2026-10-14", 0)).toBe("2026-10-14");
    expect(addWorkingDays("2026-10-17", 0)).toBe("2026-10-19"); // Saturday → Monday
    expect(addWorkingDays("2026-12-24", 0)).toBe("2026-12-28");
  });

  it("counts from the next working day when it starts on a non-working one", () => {
    expect(addWorkingDays("2026-10-17", 1)).toBe("2026-10-20"); // Saturday + 1 = Tuesday
  });

  it("refuses negative or fractional counts", () => {
    expect(() => addWorkingDays("2026-10-14", -1)).toThrow();
    expect(() => addWorkingDays("2026-10-14", 1.5)).toThrow();
  });

  it("previousWorkingDay walks back over holidays", () => {
    expect(previousWorkingDay("2026-04-07")).toBe("2026-04-02");
  });
});

describe("effectiveStartDate", () => {
  it("keeps the day up to and including the cut-off, Prague time", () => {
    // Summer time: 10:00 UTC is 12:00 in Prague.
    expect(effectiveStartDate(new Date("2026-10-14T10:00:00Z"), "12:00")).toBe("2026-10-14");
    expect(effectiveStartDate(new Date("2026-10-14T10:01:00Z"), "12:00")).toBe("2026-10-15");
    // Winter time: 11:00 UTC is 12:00 in Prague.
    expect(effectiveStartDate(new Date("2026-12-22T11:00:00Z"), "12:00")).toBe("2026-12-22");
    expect(effectiveStartDate(new Date("2026-12-22T11:01:00Z"), "12:00")).toBe("2026-12-23");
  });

  it("uses the Prague day just after midnight", () => {
    // 2026-10-15 22:30 UTC is Friday 00:30 in Prague.
    expect(effectiveStartDate(new Date("2026-10-15T22:30:00Z"), "12:00")).toBe("2026-10-16");
  });

  it("moves past weekends and holidays", () => {
    expect(effectiveStartDate({ date: "2026-10-16", time: "13:00" }, "12:00")).toBe("2026-10-19"); // Friday afternoon
    expect(effectiveStartDate({ date: "2026-12-23", time: "15:00" }, "14:00")).toBe("2026-12-28");
    expect(effectiveStartDate({ date: "2026-12-24", time: "08:00" }, "14:00")).toBe("2026-12-28");
    expect(effectiveStartDate({ date: "2026-10-14", time: "09:00" }, "12:00", ["2026-10-14"])).toBe("2026-10-15");
  });

  it("refuses a time that is not HH:MM", () => {
    expect(() => effectiveStartDate({ date: "2026-10-14", time: "9am" }, "12:00")).toThrow();
    expect(() => effectiveStartDate({ date: "2026-10-14", time: "09:00" }, "25:00")).toThrow();
  });
});
