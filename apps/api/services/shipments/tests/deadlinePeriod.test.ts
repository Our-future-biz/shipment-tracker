import { describe, expect, it } from "vitest";
import { deadlinePeriod } from "../lib/deadlinePeriod";

// Wednesday 14 October 2026, mid-morning.
const now = new Date(2026, 9, 14, 10, 30);

describe("deadlinePeriod", () => {
  it("places ISO dates around the current week", () => {
    expect(deadlinePeriod("2026-10-13", now)).toBe("OVERDUE");
    expect(deadlinePeriod("2026-10-14", now)).toBe("TODAY");
    expect(deadlinePeriod("2026-10-18", now)).toBe("THIS_WEEK"); // Sunday
    expect(deadlinePeriod("2026-10-19", now)).toBe("NEXT_WEEK");
    expect(deadlinePeriod("2026-10-25", now)).toBe("NEXT_WEEK");
    expect(deadlinePeriod("2026-10-26", now)).toBe("LATER");
  });

  it("reads legacy MM/DD/YY dates", () => {
    expect(deadlinePeriod("10/14/26", now)).toBe("TODAY");
  });

  it("ignores values that are not dates", () => {
    expect(deadlinePeriod("TBA", now)).toBeNull();
    expect(deadlinePeriod("2026-xx-01", now)).toBeNull();
  });
});
