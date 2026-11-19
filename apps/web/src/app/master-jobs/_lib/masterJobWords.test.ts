import { describe, expect, it } from "vitest";
import { kindShipments, masterJobModeOf } from "./masterJobWords";

describe("a master job's words (n31)", () => {
  it('names shipments of a Load Type without "Shipment shipments"', () => {
    expect(kindShipments("Single Shipment")).toBe("Single Shipments");
    expect(kindShipments("Project Shipment")).toBe("Project Shipments");
    expect(kindShipments("Full Load")).toBe("Full Load shipments");
  });

  it("goes by its own Freight Mode, else its shipments' one", () => {
    expect(masterJobModeOf({ freightMode: "Sea Freight", houseFreightMode: "Air Freight" })).toBe("Sea Freight");
    expect(masterJobModeOf({ freightMode: " ", houseFreightMode: "Air Freight" })).toBe("Air Freight");
    expect(masterJobModeOf({ freightMode: "", houseFreightMode: "" })).toBe("");
    expect(masterJobModeOf({})).toBe("");
  });
});
