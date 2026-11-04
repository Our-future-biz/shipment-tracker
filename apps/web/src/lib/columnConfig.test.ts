import { describe, expect, it } from "vitest";
import { COLUMN_MAP, computeDimensionTotals, dateTimeUpdate, joinDateTime, splitDateTime, summarizeDimensions } from "./columnConfig";

describe("summarizeDimensions", () => {
  it("writes each line in the unit it was typed in", () => {
    const rows = [
      { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "" },
      { pieces: "", lengthCm: "111.76", widthCm: "102.87", heightCm: "25.4", weightPerPcKg: "", dimensionUnit: "in" },
    ];
    expect(summarizeDimensions(rows)).toBe("2× 120×80×100 cm, 1× 44×40.5×10 in");
  });
  it("leaves out lines without sizes", () => {
    expect(summarizeDimensions([{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "5" }])).toBe("");
  });
  it("writes a line without sizes by the volume typed for it", () => {
    expect(summarizeDimensions([{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "5", volumePerPcM3: "0.4" }])).toBe("3× 0.4 m³");
  });
});

describe("computeDimensionTotals", () => {
  it("counts a typed volume where a line has no sizes, the sizes where it has them", () => {
    const rows = [
      { pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "10", volumePerPcM3: "5" },
      { pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "20", volumePerPcM3: "0.5" },
    ];
    const t = computeDimensionTotals(rows);
    expect(t.volumeCbm).toBeCloseTo(3.5, 6);
    expect(t.weightKg).toBe(80);
  });
});

describe("date + time columns", () => {
  it("join a date and its time into one value, and split it back", () => {
    expect(joinDateTime("2026-11-20", "12:00")).toBe("2026-11-20 12:00");
    expect(joinDateTime("2026-11-20", "")).toBe("2026-11-20");
    expect(joinDateTime(null, "12:00")).toBe("");
    // a time the old date-typed time columns stored is no time
    expect(joinDateTime("2026-11-20", "2026-11-05")).toBe("2026-11-20");
    expect(splitDateTime("2026-11-20 12:00")).toEqual({ date: "2026-11-20", time: "12:00" });
    expect(splitDateTime("2026-11-20")).toEqual({ date: "2026-11-20", time: "" });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
  });

  it("save the date and the time to their own fields", () => {
    const closing = COLUMN_MAP.get("closingDate")!;
    expect(dateTimeUpdate(closing, "2026-11-20 12:00")).toEqual({ closingDate: "2026-11-20", closingTime: "12:00" });
    // clearing the date clears its time too
    expect(dateTimeUpdate(closing, "")).toEqual({ closingDate: "", closingTime: "" });
    expect(dateTimeUpdate(COLUMN_MAP.get("isfDeadline")!, "2026-11-18")).toEqual({ isfDeadline: "2026-11-18", isfDeadlineTime: "" });
    // Pick-Up Date keeps its time in the Pickup Time field Trucking fills too
    expect(dateTimeUpdate(COLUMN_MAP.get("pickupDate")!, "2026-11-05 08:00")).toEqual({ pickupDate: "2026-11-05", pickupTime: "08:00" });
    expect(COLUMN_MAP.has("pickupTime")).toBe(false);
    expect(COLUMN_MAP.has("plannedDeliveryTime")).toBe(false);
    // a column without a time is saved as it was
    expect(dateTimeUpdate(COLUMN_MAP.get("estimatedDeparture")!, "2026-11-22")).toEqual({ estimatedDeparture: "2026-11-22" });
  });
});
