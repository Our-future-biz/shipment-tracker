import { describe, expect, it } from "vitest";
import { FUTURE_DAY_ERROR, TYPE_DATE_HINT, TYPE_TIME_HINT, leaveTypedDay, parseTypedDay, parseTypedTime, readTypedDay, resolveDateTime } from "./typedDate";

// User council O4 / E8 / M2: a date typed as the screens show it is kept, anything else is said.
describe("parseTypedDay", () => {
  it("reads the day as the screens show it, and the shorter forms", () => {
    expect(parseTypedDay("26.11.2026")).toBe("2026-11-26");
    expect(parseTypedDay("5.3.2026")).toBe("2026-03-05");
    expect(parseTypedDay("05.3.2026")).toBe("2026-03-05");
    expect(parseTypedDay("26.11.26")).toBe("2026-11-26");
    expect(parseTypedDay("1.1.70")).toBe("2070-01-01");
    expect(parseTypedDay(" 2026-11-17 ")).toBe("2026-11-17");
  });

  it("reads the day as Czech writes it, with spaces after the dots or a dot after the year", () => {
    expect(parseTypedDay("26. 11. 2026")).toBe("2026-11-26");
    expect(parseTypedDay("26.11.2026.")).toBe("2026-11-26");
    expect(parseTypedDay("26. 11. 2026.")).toBe("2026-11-26");
    expect(parseTypedDay("5. 3. 26")).toBe("2026-03-05");
  });

  it("reads nothing else, nor a day the calendar hasn't", () => {
    for (const text of ["", "26.11", "26.11.202", "26/11/2026", "2026-1-5", "tomorrow", "31.02.2026", "29.02.2027", "0.11.2026", "26.13.2026", "2026-11-31", "26 .11.2026", "26.11.2026..", "31. 02. 2026"]) {
      expect(parseTypedDay(text)).toBeNull();
    }
    expect(parseTypedDay("29.02.2028")).toBe("2028-02-29");
  });
});

describe("parseTypedTime", () => {
  it("reads HH:MM and H:MM", () => {
    expect(parseTypedTime("16:00")).toBe("16:00");
    expect(parseTypedTime(" 9:30")).toBe("09:30");
    expect(parseTypedTime("00:00")).toBe("00:00");
  });

  it("reads nothing else", () => {
    for (const text of ["24:00", "12:60", "1600", "16", "16:0", "4 pm"]) expect(parseTypedTime(text)).toBeNull();
  });
});

describe("readTypedDay", () => {
  it("gives the day, an emptied box as no day, or the hint", () => {
    expect(readTypedDay("26.11.2026")).toEqual({ day: "2026-11-26" });
    expect(readTypedDay("  ")).toEqual({ day: "" });
    expect(readTypedDay("26.11.202")).toEqual({ error: TYPE_DATE_HINT });
  });

  it("refuses a day the field doesn't allow, as its picker greys it out", () => {
    const afterToday = (day: string) => day > "2026-11-20";
    expect(readTypedDay("21.11.2026", afterToday)).toEqual({ error: FUTURE_DAY_ERROR });
    expect(readTypedDay("20.11.2026", afterToday)).toEqual({ day: "2026-11-20" });
  });
});

describe("leaveTypedDay", () => {
  const afterToday = (day: string) => day > "2026-11-20";

  it("saves a day typed and left by Tab or a click elsewhere, as Enter does", () => {
    expect(leaveTypedDay("26.11.26", false)).toEqual({ day: "2026-11-26" });
    expect(leaveTypedDay("", false)).toEqual({ day: "" });
  });

  it("keeps the editor open, saying why, for typing that isn't a day the field allows", () => {
    expect(leaveTypedDay("26.11.202", false)).toEqual({ error: TYPE_DATE_HINT });
    expect(leaveTypedDay("21.11.2026", false, afterToday)).toEqual({ error: FUTURE_DAY_ERROR });
  });

  it("just closes on Escape, or when nothing was typed", () => {
    expect(leaveTypedDay("26.11.2026", true)).toEqual({ close: true });
    expect(leaveTypedDay("26.11.202", true)).toEqual({ close: true });
    expect(leaveTypedDay(null, false)).toEqual({ close: true });
  });
});

describe("resolveDateTime", () => {
  const picked = { date: "2026-11-24", time: "16:00" };

  it("keeps what the pickers hold when nothing was typed", () => {
    expect(resolveDateTime(picked, { date: null, time: null })).toEqual({ value: "2026-11-24 16:00" });
    expect(resolveDateTime({ date: "", time: "" }, {})).toEqual({ value: "" });
  });

  it("takes a typed date and time over the picked ones", () => {
    expect(resolveDateTime(picked, { date: "26.11.2026", time: null })).toEqual({ value: "2026-11-26 16:00" });
    expect(resolveDateTime(picked, { date: "26.11.26", time: "9:30" })).toEqual({ value: "2026-11-26 09:30" });
    expect(resolveDateTime(picked, { date: null, time: "" })).toEqual({ value: "2026-11-24" });
    expect(resolveDateTime(picked, { date: "", time: null })).toEqual({ value: "" });
  });

  it("names the box that can't be read instead of keeping the old value", () => {
    expect(resolveDateTime(picked, { date: "26.11.202", time: null })).toEqual({ error: TYPE_DATE_HINT, box: "date" });
    expect(resolveDateTime(picked, { date: null, time: "1600" })).toEqual({ error: TYPE_TIME_HINT, box: "time" });
  });
});
