import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/sales/_lib/types";
import { withCharge } from "./CostLinesEditor";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Other", chargeCode: "other", description: "", supplier: "", currency: "USD", amount: 0, ...over });

describe("withCharge", () => {
  it("pre-types the description from the chosen type", () => {
    expect(withCharge(line(), "ocean_freight")).toMatchObject({ chargeCode: "ocean_freight", description: "Ocean freight" });
  });

  it("follows the type while the description is still the pre-typed one", () => {
    const ocean = withCharge(line(), "ocean_freight");
    expect(withCharge(ocean, "air_freight").description).toBe("Air freight");
  });

  it("keeps a description written by hand", () => {
    expect(withCharge(line({ chargeCode: "ocean_freight", type: "Ocean freight", description: "SHA–HAM 40HC" }), "air_freight").description).toBe("SHA–HAM 40HC");
  });

  it("leaves the description blank for Other", () => {
    expect(withCharge(line({ chargeCode: "ocean_freight", type: "Ocean freight", description: "Ocean freight" }), "other").description).toBe("");
  });
});
