import { describe, expect, it } from "vitest";
import { figureFromTrip, isFromTrip, splitPickupRows, tripHref, tripLabel, tripSourceOf } from "./tripSource";

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

  it("links to the trip when its id is known", () => {
    const x = { source: { kind: "trucking", tripRef: "LCZ1", tripId: "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" } };
    expect(tripSourceOf(x)).toEqual({ kind: "trucking", tripRef: "LCZ1", tripId: "6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" });
    expect(tripHref(x)).toBe("/trucking/trips/6f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
    expect(tripHref({ source: { kind: "trucking", tripRef: "LCZ1" } })).toBeNull();
    expect(tripHref({})).toBeNull();
  });

  it("marks a gate figure only while it is as the trip wrote it", () => {
    const f = { source: { kind: "trucking", tripRef: "LCZ1" }, colli: 4, weightKg: 400 };
    expect(figureFromTrip(f, "colli", 4)).toBe(true);
    expect(figureFromTrip(f, "colli", 5)).toBe(false);
    expect(figureFromTrip(f, "measureCbm", 0)).toBe(false);
    expect(figureFromTrip(null, "colli", 4)).toBe(false);
  });

  it("splits pick-up rows into the trip's (read-only) and the page's own", () => {
    const trip = { haulier: "Rapid", licensePlate: "1AB 2345", driver: "Jan", source: { kind: "trucking", tripRef: "LCZ1" } };
    const own = { haulier: "Typed", licensePlate: "", driver: "" };
    expect(splitPickupRows([trip, own])).toEqual({ tripRows: [trip], ownRows: [own] });
    expect(splitPickupRows([])).toEqual({ tripRows: [], ownRows: [] });
  });
});
