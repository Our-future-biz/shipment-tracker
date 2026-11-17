import { describe, expect, it } from "vitest";
import { dockDayRefusal, dockHolidayName } from "./dockDays";

describe("dock days", () => {
  it("names the Czech public holidays the docks do not work on, the movable ones too", () => {
    expect(dockHolidayName("2026-11-17")).toBe("Struggle for Freedom and Democracy Day");
    expect(dockHolidayName("2026-12-24")).toBe("Christmas Eve");
    expect(dockHolidayName("2026-12-25")).toBe("Christmas Day");
    // Easter 2026 is on 5 April.
    expect(dockHolidayName("2026-04-03")).toBe("Good Friday");
    expect(dockHolidayName("2026-04-06")).toBe("Easter Monday");
  });

  it("keeps every other day open, weekends included, and refuses a holiday with the server's sentence", () => {
    expect(dockHolidayName("2026-11-18")).toBeNull();
    expect(dockHolidayName("2026-11-21")).toBeNull();
    expect(dockHolidayName("")).toBeNull();
    expect(dockDayRefusal("2026-11-18")).toBeNull();
    expect(dockDayRefusal("2026-12-24")).toBe("The docks do not work on 2026-12-24, a Czech public holiday — pick another day");
  });
});
