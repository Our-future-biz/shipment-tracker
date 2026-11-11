import { describe, expect, it } from "vitest";
import { copiedCargo } from "../services/copiedCargo";

describe("copiedCargo", () => {
  it("reads pieces shown with thousands separators", () => {
    expect(copiedCargo({ pcs: "1,353" }).colli).toBe(1353);
    expect(copiedCargo({ pcs: "12" }).colli).toBe(12);
  });

  it("reads a weight or volume with a decimal comma, keeping the kg to the gram", () => {
    expect(copiedCargo({ totalWeightTons: "4,2", totalVolumeCbm: "12,75" })).toEqual({ colli: 0, weightKg: 4200, measureCbm: 12.75 });
    expect(copiedCargo({ totalWeightTons: "1.2345" }).weightKg).toBe(1234.5);
  });

  it("gives 0 for what is missing or no number", () => {
    expect(copiedCargo({})).toEqual({ colli: 0, weightKg: 0, measureCbm: 0 });
    expect(copiedCargo({ pcs: "n/a", totalWeightTons: "", totalVolumeCbm: "-3" })).toEqual({ colli: 0, weightKg: 0, measureCbm: 0 });
  });
});
