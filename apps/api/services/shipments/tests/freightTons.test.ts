import { describe, expect, it } from "vitest";
import { freightTons } from "../lib/freightTons";

describe("freightTons (as the web's shipmentFreight)", () => {
  it("takes weight and volume from the cargo dimensions when there are any", () => {
    const dims = [{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250" }];
    expect(freightTons(dims, { totalWeightTons: "9", totalVolumeCbm: "9" })).toEqual({ tons: 0.5, cbm: 1.92, freightTon: 1.92 });
  });

  it("counts a line's typed volume when its sizes are not known", () => {
    const dims = [{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "100", volumePerPcM3: "1.5" }];
    expect(freightTons(dims, {})).toEqual({ tons: 0.3, cbm: 4.5, freightTon: 4.5 });
  });

  it("falls back to the typed totals, W/M being the greater", () => {
    expect(freightTons([], { totalWeightTons: "12.03", totalVolumeCbm: "4" })).toEqual({ tons: 12.03, cbm: 4, freightTon: 12.03 });
    expect(freightTons([], {}).freightTon).toBe(0);
  });
});
