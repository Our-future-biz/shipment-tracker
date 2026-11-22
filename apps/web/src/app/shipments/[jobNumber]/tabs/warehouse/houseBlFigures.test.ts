import { describe, expect, it } from "vitest";
import { checkConsistency } from "@/lib/cargo";
import { houseBlDeclaredFigures, readHouseBlFigures } from "./houseBlFigures";

describe("the House B/L's figures in the Warehouse (owner's answer 22 Nov)", () => {
  it("reads what Document Reading kept", () => {
    const kept = JSON.stringify({ houseBol: "HBL1", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "2026-11-22T12:00:00Z" });
    expect(readHouseBlFigures(kept)).toEqual({ houseBol: "HBL1", colli: 30, weightKg: 1500, volumeCbm: 3.5, readAt: "2026-11-22T12:00:00Z" });
  });

  it("is none when nothing was kept, nothing is filled or it can't be read", () => {
    expect(readHouseBlFigures(undefined)).toBeNull();
    expect(readHouseBlFigures(JSON.stringify({ houseBol: "HBL1", colli: 0 }))).toBeNull();
    expect(readHouseBlFigures("not json")).toBeNull();
    expect(readHouseBlFigures("[]")).toBeNull();
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
