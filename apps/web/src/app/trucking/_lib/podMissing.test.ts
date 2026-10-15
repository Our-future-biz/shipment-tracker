import { describe, expect, it } from "vitest";
import { isWorkingDay, podWait, workingDaysBetween } from "./podMissing";

describe("working days", () => {
  it("skip weekends and Czech public holidays", () => {
    expect(isWorkingDay("2026-10-15")).toBe(true); // Thursday
    expect(isWorkingDay("2026-10-17")).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-28")).toBe(false); // Independent Czechoslovak State Day
    expect(isWorkingDay("2026-04-03")).toBe(false); // Good Friday 2026
  });

  it("are counted after the first day up to the last", () => {
    expect(workingDaysBetween("2026-10-15", "2026-10-15")).toBe(0);
    expect(workingDaysBetween("2026-10-15", "2026-10-19")).toBe(2); // Fri, Mon
    expect(workingDaysBetween("2026-10-26", "2026-10-30")).toBe(3); // Tue, Thu, Fri (Wed 28th is a holiday)
  });
});

describe("POD missing", () => {
  it("is shown from the third working day after delivery", () => {
    expect(podWait("2026-10-15T12:00:00Z", null, "2026-10-19")).toEqual({ days: 2, missing: false, text: "Delivered 2 working days ago, waiting for the POD" });
    expect(podWait("2026-10-15T12:00:00Z", null, "2026-10-20")).toEqual({ days: 3, missing: true, text: "Delivered 3 working days ago — POD missing" });
    expect(podWait("2026-10-15T12:00:00Z", null, "2026-10-15")?.text).toBe("Delivered today, waiting for the POD");
  });

  it("is nothing once the POD is in or before delivery", () => {
    expect(podWait("2026-10-15T12:00:00Z", "2026-10-16T08:00:00Z", "2026-10-30")).toBeNull();
    expect(podWait(null, null, "2026-10-30")).toBeNull();
  });
});
