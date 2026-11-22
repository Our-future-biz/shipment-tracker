import { describe, expect, it } from "vitest";
import { checkConsistency } from "@/lib/cargo";
import { heldToHouseBl, houseBlDeclaredFigures, readHouseBlFigures } from "./houseBlFigures";

describe("the House B/L's figures in the Warehouse (owner's answer 22 Nov)", () => {
  it("reads what Document Reading kept", () => {
    const kept = JSON.stringify({ houseBol: "HBL1", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "2026-11-22T12:00:00Z" });
    expect(readHouseBlFigures(kept, "HBL1")).toEqual({ houseBol: "HBL1", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "2026-11-22T12:00:00Z" });
  });

  it("is none when nothing was kept, nothing is filled or it can't be read", () => {
    expect(readHouseBlFigures(undefined, "HBL1")).toBeNull();
    expect(readHouseBlFigures(JSON.stringify({ houseBol: "HBL1", colli: 0 }), "HBL1")).toBeNull();
    expect(readHouseBlFigures("not json", "HBL1")).toBeNull();
    expect(readHouseBlFigures("[]", "HBL1")).toBeNull();
  });

  // Review of system-23: after the shipment's House B/L was corrected, the figures read from the old one are not its.
  it("is none when the figures are of another House B/L than the shipment's", () => {
    const kept = JSON.stringify({ houseBol: "CHI/BRV/V01035", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "" });
    expect(readHouseBlFigures(kept, "CHI/BRV/V01036")).toBeNull();
    expect(readHouseBlFigures(kept, "")).toBeNull();
    expect(readHouseBlFigures(kept, null)).toBeNull();
  });

  it("takes the same House B/L however it is written (letters and digits, any case)", () => {
    const kept = JSON.stringify({ houseBol: "CHI/BRV/V01035", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "" });
    expect(readHouseBlFigures(kept, " chibrv v01035 ")?.colli).toBe(30);
  });

  it("keeps counting figures kept without the House B/L they were read from", () => {
    const kept = JSON.stringify({ colli: 30, weightKg: 1500, volumeCbm: 3.5 });
    expect(readHouseBlFigures(kept, "HBL9")?.colli).toBe(30);
    expect(readHouseBlFigures(JSON.stringify({ houseBol: " ", colli: 30 }), "HBL9")?.colli).toBe(30);
  });
});

describe("a consolidation's Dimensions against its House B/L (owner's answer 22 Nov)", () => {
  const line = { containerId: null, pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "150", packageType: "", stackable: "" };

  it("holds the lines against the B/L's Colli, weight and volume", () => {
    const check = checkConsistency(houseBlDeclaredFigures({ colli: 2, weightKg: 300, volumeCbm: 1.92 }), [line]);
    expect(check.matched).toBe(true);
    const off = checkConsistency(houseBlDeclaredFigures({ colli: 1, weightKg: 300, volumeCbm: 0.96 }), [line]);
    expect([off.pcs.ok, off.kg.ok, off.m3.ok]).toEqual([false, true, false]);
  });

  it("declares nothing while no B/L was read", () => {
    expect(houseBlDeclaredFigures(null)).toMatchObject({ packages: "", grossWeight: "", volume: "" });
  });
});

// Review of system-23: only a sea consolidation's container is the master's box.
describe("heldToHouseBl", () => {
  const sea = { loadType: "Consolidation", freightMode: "Sea Freight", tradeDirection: "Import", department: "Operation Department" };

  it("holds a sea consolidation with containers against its House B/L", () => {
    expect(heldToHouseBl(sea, 1)).toBe(true);
    expect(heldToHouseBl({ ...sea, freightMode: "" }, 2)).toBe(true);
  });

  it("reads the load type in any case and spacing, as the server does", () => {
    expect(heldToHouseBl({ ...sea, loadType: "consolidation" }, 1)).toBe(true);
    expect(heldToHouseBl({ ...sea, loadType: " CONSOLIDATION " }, 1)).toBe(true);
  });

  it("checks Trucking's road consolidation as before: it has no master's box", () => {
    const road = { loadType: "Consolidation", freightMode: "Road Freight", tradeDirection: "Domestic", department: "Road Department" };
    expect(heldToHouseBl(road, 0)).toBe(false);
    expect(heldToHouseBl(road, 1)).toBe(false);
    // A Road Department job goes by road whatever its Freight Mode says.
    expect(heldToHouseBl({ ...sea, department: "Road Department" }, 1)).toBe(false);
  });

  it("checks an air consolidation as before, also one carrying container rows", () => {
    expect(heldToHouseBl({ ...sea, freightMode: "Air Freight" }, 1)).toBe(false);
  });

  it("checks a sea consolidation with no container as before", () => {
    expect(heldToHouseBl(sea, 0)).toBe(false);
  });

  it("checks every other load type as before", () => {
    expect(heldToHouseBl({ ...sea, loadType: "Full Load" }, 1)).toBe(false);
    expect(heldToHouseBl({ ...sea, loadType: "" }, 1)).toBe(false);
    expect(heldToHouseBl({ ...sea, loadType: null }, 1)).toBe(false);
  });
});
