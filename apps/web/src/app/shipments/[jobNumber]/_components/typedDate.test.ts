import { describe, expect, it } from "vitest";
import {
  FUTURE_DAY_ERROR,
  TYPE_DATE_HINT,
  TYPE_TIME_HINT,
  YEAR_SPAN,
  leaveTypedDay,
  leavesEditor,
  parseTypedDay,
  parseTypedTime,
  readTypedDay,
  resolveDateTime,
  yearOutOfReach,
  yearOutOfReachError,
} from "./typedDate";

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

describe("a typed year far from today (mock council S1-05)", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("is refused: a year out of order, cut short, or 99 read as 2099", () => {
    for (const [text, year] of [["11.12.2062", 2062], ["11.12.0026", 26], ["1.1.99", 2099], ["2047-01-01", 2047], ["31.12.2005", 2005]] as const) {
      const read = readTypedDay(text, undefined, now);
      expect(read).toEqual({ error: yearOutOfReachError(parseTypedDay(text)!) });
      expect("error" in read && read.error).toMatch(new RegExp(`^${year} is more than ${YEAR_SPAN} years from today\\. Type the date as 26\\.11\\.2026\\. Esc keeps the old date$`));
    }
  });

  it("is taken within 20 years either way, a two-digit year in this century", () => {
    expect(readTypedDay("1.1.46", undefined, now)).toEqual({ day: "2046-01-01" });
    expect(readTypedDay("31.12.2046", undefined, now)).toEqual({ day: "2046-12-31" });
    expect(readTypedDay("01.01.2006", undefined, now)).toEqual({ day: "2006-01-01" });
    expect(readTypedDay("26.11.26", undefined, now)).toEqual({ day: "2026-11-26" });
  });

  it("is refused in the date + time editor too, naming the date box", () => {
    expect(resolveDateTime({ date: "", time: "" }, { date: "25.11.2062", time: "16:00" }, now)).toEqual({ error: yearOutOfReachError("2062-11-25"), box: "date" });
  });

  it("greys the picker's day the same", () => {
    expect(yearOutOfReach("2062-11-25", now)).toBe(true);
    expect(yearOutOfReach("2005-12-31", now)).toBe(true);
    expect(yearOutOfReach("2046-12-31", now)).toBe(false);
    expect(yearOutOfReach("2006-01-01", now)).toBe(false);
  });
});

describe("what a date box that can't be read says (mock council R5)", () => {
  it("names Escape, which keeps the old date: an emptied box is saved as no date", () => {
    expect(TYPE_DATE_HINT).toMatch(/Esc keeps the old date$/);
    expect(FUTURE_DAY_ERROR).toMatch(/Esc keeps the old date$/);
    expect(TYPE_TIME_HINT).toMatch(/Esc keeps the old date and time$/);
    // An emptied box still clears the date (kept as it is).
    expect(leaveTypedDay("", false)).toEqual({ day: "" });
  });
});

describe("leaving a date + time editor (mock council S1-04)", () => {
  // Stand-ins: the editor holds its boxes and ✓; a picker's panel is rendered elsewhere in the page.
  const inside = { closest: () => null };
  const panelCell = { closest: (s: string) => (s === ".ant-picker-dropdown" ? {} : null) };
  const nextField = { closest: () => null };
  const editor = { contains: (n: unknown) => n === inside };
  const as = (x: unknown) => x as Element;

  it("saves when Tab takes the focus out of it", () => {
    expect(leavesEditor(as(nextField), as(editor))).toBe(true);
  });

  it("not while the focus goes from the date to the time or the ✓, or into a picker's panel", () => {
    expect(leavesEditor(as(inside), as(editor))).toBe(false);
    expect(leavesEditor(as(panelCell), as(editor))).toBe(false);
  });

  it("not for a focus going nowhere: a click elsewhere saves by its own", () => {
    expect(leavesEditor(null, as(editor))).toBe(false);
    expect(leavesEditor(as(nextField), null)).toBe(false);
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
