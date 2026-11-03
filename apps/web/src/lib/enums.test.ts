import { describe, expect, it } from "vitest";
import { loadTypeLabel } from "./enums";

describe("loadTypeLabel", () => {
  it("reads an Air Freight Full Load as Single Shipment", () => {
    expect(loadTypeLabel("Full Load", "Air Freight")).toBe("Single Shipment");
  });

  it("keeps every other load type and freight mode as stored", () => {
    expect(loadTypeLabel("Consolidation", "Air Freight")).toBe("Consolidation");
    expect(loadTypeLabel("Full Load", "Sea Freight")).toBe("Full Load");
    expect(loadTypeLabel("Full Load", "")).toBe("Full Load");
    expect(loadTypeLabel(null, "Air Freight")).toBe("");
  });
});
