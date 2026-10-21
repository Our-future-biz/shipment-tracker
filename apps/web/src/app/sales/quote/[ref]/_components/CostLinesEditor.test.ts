import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/sales/_lib/types";
import { amountOf, serviceChange } from "./CostLinesEditor";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Ocean freight", chargeCode: "ocean_freight", description: "Ocean freight", supplier: "", currency: "USD", amount: 0, ...over });

describe("amountOf", () => {
  it("reads a stored amount as a number, whether it was saved as one, as text, or not at all", () => {
    expect(amountOf(line({ amount: 750 }))).toBe(750);
    expect(amountOf({ ...line(), amount: "750" as unknown as number })).toBe(750);
    expect(amountOf({ ...line(), amount: undefined as unknown as number })).toBe(0);
  });
});

describe("serviceChange", () => {
  it("names a line after its new service when its description is blank or the old service's name", () => {
    expect(serviceChange(line({ description: "" }), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "Air freight" }), ask: false });
    expect(serviceChange(line(), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "Air freight" }), ask: false });
  });

  it("follows the service while the description is still the pre-typed one", () => {
    const air = serviceChange(line({ type: "Other", chargeCode: "other", description: "" }), "air_freight").line;
    expect(serviceChange(air, "rail_freight")).toMatchObject({ line: { chargeCode: "rail_freight", description: "Rail freight" }, ask: false });
  });

  it("keeps a description written by hand, and asks whether it gives way", () => {
    expect(serviceChange(line({ description: "SHA–HAM 40HC" }), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "SHA–HAM 40HC" }), ask: true });
  });

  it("asks nothing when the description is the new service's name already", () => {
    expect(serviceChange(line({ description: "Air freight" }), "air_freight")).toMatchObject({ ask: false });
  });

  it("leaves the description blank for Other", () => {
    expect(serviceChange(line(), "other")).toMatchObject({ line: { chargeCode: "other", description: "" }, ask: false });
  });
});
