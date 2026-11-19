import { describe, expect, it } from "vitest";
import { kindFits, loadTypesOf, masterJobKindOf, shipmentFits } from "./masterJobKind";

describe("master job filling", () => {
  it("lists the distinct Load Types of shipments, without blanks or repeats", () => {
    expect(loadTypesOf([{ loadType: "Consolidation" }, { loadType: " consolidation" }, { loadType: "" }, { loadType: "Full Load" }])).toEqual([
      "Consolidation",
      "Full Load",
    ]);
  });

  it("is the master job's own Load Type, else that of the shipments on it", () => {
    expect(masterJobKindOf("Consolidation", [{ loadType: "Full Load" }])).toBe("Consolidation");
    expect(masterJobKindOf("", [{ loadType: null }, { loadType: "Full Load" }])).toBe("Full Load");
    expect(masterJobKindOf(null, [])).toBeNull();
  });

  it("fits CZLCL jobs to a CZCONSOL master and not to a CZFULL one; a plain one with nothing on it takes any", () => {
    expect(kindFits("Consolidation", ["Consolidation"])).toBe(true);
    expect(kindFits("Full Load", ["Consolidation"])).toBe(false);
    expect(kindFits(null, ["Consolidation", "Full Load"])).toBe(true);
    expect(kindFits("Consolidation", [])).toBe(true);
  });

  it("takes nothing with a Load Type on a plain master job already holding two (from before the rule)", () => {
    expect(masterJobKindOf("", [{ loadType: "Consolidation" }, { loadType: "Full Load" }])).toBe("mixed");
    expect(kindFits("mixed", ["Consolidation"])).toBe(false);
    expect(kindFits("mixed", [])).toBe(true);
    expect(shipmentFits("mixed", { loadType: "Full Load" })).toBe(false);
    expect(shipmentFits("mixed", { loadType: "" })).toBe(true);
  });

  it("fits a shipment without a Load Type anywhere", () => {
    expect(shipmentFits("Full Load", { loadType: "" })).toBe(true);
    expect(shipmentFits("Full Load", { loadType: "Consolidation" })).toBe(false);
    expect(shipmentFits(null, { loadType: "Consolidation" })).toBe(true);
  });
});
