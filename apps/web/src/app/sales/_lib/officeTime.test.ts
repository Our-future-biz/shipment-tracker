import { describe, expect, it } from "vitest";
import { officeTime } from "./officeTime";

describe("office time", () => {
  it("says minutes, hours, then office days of 9 hours with the hours left over", () => {
    expect(officeTime(0)).toBe("0 min");
    expect(officeTime(45)).toBe("45 min");
    expect(officeTime(60)).toBe("1 h");
    expect(officeTime(8 * 60 + 59)).toBe("8 h");
    expect(officeTime(9 * 60)).toBe("1 office day");
    expect(officeTime(11 * 60 + 30)).toBe("1 office day 2 h");
    expect(officeTime(18 * 60)).toBe("2 office days");
    expect(officeTime(20 * 60)).toBe("2 office days 2 h");
  });
});
