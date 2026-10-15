import { describe, expect, it } from "vitest";
import { isTruckingCost, parseTruckingRef, truckingCostTag } from "./truckingCosts";

const consignments = [{ id: "c1", ref: "TCZ2026000123", tripId: "t1" }];

describe("Trucking cost rows", () => {
  it("reads the source ref", () => {
    expect(parseTruckingRef("trucking:consignment:c1")).toEqual({ kind: "consignment", id: "c1" });
    expect(parseTruckingRef("trucking:trip:t1")).toEqual({ kind: "trip", id: "t1" });
    expect(parseTruckingRef(null)).toBeNull();
    expect(parseTruckingRef("quote:QCZ1")).toBeNull();
    expect(isTruckingCost("trucking:trip:t1")).toBe(true);
    expect(isTruckingCost(undefined)).toBe(false);
  });

  it("tags a row with its consignment, a trip row by the consignment on it", () => {
    expect(truckingCostTag("trucking:consignment:c1", consignments)).toBe("From Trucking · TCZ2026000123");
    expect(truckingCostTag("trucking:trip:t1", consignments)).toBe("From Trucking · TCZ2026000123");
    expect(truckingCostTag("trucking:trip:t9", consignments)).toBe("From Trucking");
  });
});
