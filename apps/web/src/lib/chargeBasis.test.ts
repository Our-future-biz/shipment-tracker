import { describe, expect, it } from "vitest";
import { chargeBasis, fmtChargeBasis, isAirFreight } from "./chargeBasis";

describe("chargeBasis", () => {
  it("air: the greater of gross and volumetric weight (÷ 6000)", () => {
    // CZAIR00000094: declared 170 kg, 7.2 m³; remeasured 250 kg, 34.65 m³
    expect(chargeBasis("Air Freight", 170, 7.2)).toMatchObject({ label: "Chargeable weight (kg)", value: 1200, unit: "kg" });
    expect(chargeBasis("Air Freight", 250, 34.65).value).toBe(5775);
    expect(chargeBasis("Air Freight", 900, 1).value).toBe(900);
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
