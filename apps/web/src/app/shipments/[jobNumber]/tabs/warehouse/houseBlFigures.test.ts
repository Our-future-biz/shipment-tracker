import { describe, expect, it } from "vitest";
import { readHouseBlFigures } from "./houseBlFigures";

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
