import { describe, expect, it } from "vitest";
import { chargeableKg, chargeBasis, chargedByWeightOrMeasure, fmtChargeBasis, isAirFreight } from "./chargeBasis";

describe("chargeBasis", () => {
  it("air: the greater of gross and volumetric weight (÷ 6000)", () => {
    // CZAIR00000094: declared 170 kg, 7.2 m³; remeasured 250 kg, 34.65 m³
    expect(chargeBasis("Air Freight", 170, 7.2)).toMatchObject({ label: "Chargeable weight (kg)", value: 1200, unit: "kg" });
    expect(chargeBasis("Air Freight", 250, 34.65).value).toBe(5775);
    expect(chargeBasis("Air Freight", 900, 1).value).toBe(900);
  });

  // One rule with Sales quotes (User Council S1): 0.1 kg, so a Won quote's kilos are the job's.
  it("rounds the chargeable weight to 0.1 kg, the rule Sales quotes count by too", () => {
    expect(chargeableKg(350, 3.844)).toBe(640.7);
    expect(chargeableKg(640.67, 0)).toBe(640.7);
    expect(chargeableKg(-5, -1)).toBe(0);
    expect(chargeBasis("Air Freight", 350, 3.844).value).toBe(chargeableKg(350, 3.844));
  });

  it("other modes: W/M, the greater of tons and m³", () => {
    expect(chargeBasis("Sea Freight", 3000, 2)).toMatchObject({ label: "W/M", value: 3 });
    expect(chargeBasis("Road Freight", 170, 7.2).value).toBe(7.2);
    expect(chargeBasis("", 0, 0).value).toBe(0);
  });

  it("reads the freight mode however it is written", () => {
    expect(isAirFreight(" air freight")).toBe(true);
    expect(isAirFreight("Sea Freight")).toBe(false);
    expect(isAirFreight(null)).toBe(false);
  });
});

describe("fmtChargeBasis", () => {
  it("shows the figure with its unit, a dash for none", () => {
    expect(fmtChargeBasis(chargeBasis("Air Freight", 250, 34.65))).toBe("5,775.0 kg");
    expect(fmtChargeBasis(chargeBasis("Sea Freight", 170, 7.2))).toBe("7.200");
    expect(fmtChargeBasis(chargeBasis("Sea Freight", 0, 0))).toBe("—");
  });
});

// Council finding K5: a sea Full Load is charged per container - no W/M beside its remeasurement.
describe("chargedByWeightOrMeasure", () => {
  it("is not a sea Full Load, however written", () => {
    expect(chargedByWeightOrMeasure("Sea Freight", "Full Load")).toBe(false);
    expect(chargedByWeightOrMeasure(" sea freight ", "FULL LOAD")).toBe(false);
    expect(chargedByWeightOrMeasure("Sea Freight", "Consolidation")).toBe(true);
    expect(chargedByWeightOrMeasure("Air Freight", "Full Load")).toBe(true);
    expect(chargedByWeightOrMeasure("Road Freight", "Full Load")).toBe(true);
    expect(chargedByWeightOrMeasure(null, null)).toBe(true);
  });

  // Mock test council P18: a rail Full Load is charged per container like a sea one.
  it("is not a rail Full Load either", () => {
    expect(chargedByWeightOrMeasure("Rail Freight", "Full Load")).toBe(false);
    expect(chargedByWeightOrMeasure(" rail freight ", "full load")).toBe(false);
    expect(chargedByWeightOrMeasure("Rail Freight", "Consolidation")).toBe(true);
  });
});
