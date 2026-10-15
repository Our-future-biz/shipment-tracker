import { describe, expect, it } from "vitest";
import { isFromTrip, splitPickupRows, tripLabel, tripSourceOf } from "./tripSource";

describe("trip marker (read-only \"From trip LCZ…\")", () => {
  it("labels only data a trip filled", () => {
    expect(tripLabel({ source: { kind: "trucking", tripRef: "LCZ26-0001" } })).toBe("From trip LCZ26-0001");
    expect(tripLabel({ source: null })).toBeNull();
    expect(tripLabel({})).toBeNull();
    expect(tripLabel({ source: { kind: "other", tripRef: "LCZ1" } })).toBeNull();
    expect(tripLabel({ source: { kind: "trucking", tripRef: " " } })).toBeNull();
    expect(tripSourceOf({ source: { kind: "trucking", tripRef: "LCZ1", extra: 1 } })).toEqual({ kind: "trucking", tripRef: "LCZ1" });
    expect(isFromTrip(undefined)).toBe(false);
  });

  it("splits pick-up rows into the trip's (read-only) and the page's own", () => {
    const trip = { haulier: "Rapid", licensePlate: "1AB 2345", driver: "Jan", source: { kind: "trucking", tripRef: "LCZ1" } };
    const own = { haulier: "Typed", licensePlate: "", driver: "" };
    expect(splitPickupRows([trip, own])).toEqual({ tripRows: [trip], ownRows: [own] });
    expect(splitPickupRows([])).toEqual({ tripRows: [], ownRows: [] });
  });
});
