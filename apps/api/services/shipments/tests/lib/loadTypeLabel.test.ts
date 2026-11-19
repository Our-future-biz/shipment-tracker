import { describe, expect, it } from "vitest";
import { loadTypeLabel } from "../../lib/loadTypeLabel";

describe("loadTypeLabel", () => {
  it("calls an air Full Load a Single Shipment, as the screens do", () => {
    expect(loadTypeLabel("Full Load", "Air Freight")).toBe("Single Shipment");
    expect(loadTypeLabel("Full Load", "air")).toBe("Single Shipment");
  });

  it("leaves every other Load Type and mode as stored", () => {
    expect(loadTypeLabel("Full Load", "Sea Freight")).toBe("Full Load");
    expect(loadTypeLabel("Full Load", "")).toBe("Full Load");
    expect(loadTypeLabel("Consolidation", "Air Freight")).toBe("Consolidation");
    expect(loadTypeLabel(null, "Air Freight")).toBe("");
  });
});
