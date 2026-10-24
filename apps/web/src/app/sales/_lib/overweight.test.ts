import { describe, expect, it } from "vitest";
import type { CostLine, SalesQuoteData } from "./types";
import { isOverweight, overweightLine, overweightUnexplained, unpricedOverweight, withOverweight } from "./overweight";

// 12,599 kg in 5 cbm: 0.4 cbm/t.
const dense: SalesQuoteData = { serviceType: "Sea LCL", weight: 12599, cbm: 5, currency: "EUR" };
const freight: CostLine = { type: "Ocean freight", description: "LCL", currency: "EUR", amount: 300 };

describe("isOverweight", () => {
  it("is a Sea LCL shipment of over 2 t under 2.2 cbm/t", () => {
    expect(isOverweight(dense)).toBe(true);
    expect(isOverweight({ ...dense, serviceType: "Air" })).toBe(false);
    expect(isOverweight({ ...dense, weight: 2000, cbm: 1 })).toBe(false);
    // 2.5 t in 6 cbm: 2.4 cbm/t.
    expect(isOverweight({ ...dense, weight: 2500, cbm: 6 })).toBe(false);
    // Without a volume there is no ratio to judge by.
    expect(isOverweight({ ...dense, cbm: 0 })).toBe(false);
  });
});

describe("withOverweight", () => {
  it("puts the surcharge to selling at 0, once", () => {
    const patch = withOverweight({ ...dense, sellingLines: [freight] });
    expect(patch).toEqual({ sellingLines: [freight, overweightLine(dense)] });
    expect(patch!.sellingLines![1]).toMatchObject({ description: "Overweight surcharge", amount: 0, basis: "lumpsum" });
    expect(withOverweight({ ...dense, ...patch })).toBeNull();
  });

  it("does not put it back once removed with a reason, and drops the reason once it is priced", () => {
    expect(withOverweight({ ...dense, sellingLines: [freight], overweightReason: "In the freight" })).toBeNull();
    const priced = { ...overweightLine(dense), amount: 80 };
    expect(withOverweight({ ...dense, sellingLines: [priced], overweightReason: "In the freight" })).toEqual({ overweightReason: undefined });
  });

  it("takes the line at 0 and the reason away once the quote is not overweight; a priced line stays", () => {
    const light = { ...dense, weight: 1500 };
    expect(withOverweight({ ...light, sellingLines: [freight, overweightLine(dense)], overweightReason: "x" })).toEqual({ sellingLines: [freight], overweightReason: undefined });
    expect(withOverweight({ ...light, sellingLines: [{ ...overweightLine(dense), amount: 80 }] })).toBeNull();
    expect(withOverweight({ ...light, sellingLines: [freight] })).toBeNull();
  });
});

describe("overweightUnexplained", () => {
  it("asks while the surcharge is at 0 without a reason", () => {
    const at0 = { ...dense, sellingLines: [overweightLine(dense)] };
    expect(overweightUnexplained(at0)).toBe(true);
    expect(overweightUnexplained({ ...at0, overweightReason: "Agreed" })).toBe(false);
    expect(overweightUnexplained({ ...dense, sellingLines: [{ ...overweightLine(dense), amount: 80 }] })).toBe(false);
    expect(overweightUnexplained({ ...at0, weight: 1500 })).toBe(false);
  });

  it("leaves the surcharge at 0 off the customer's quotation", () => {
    expect(unpricedOverweight(overweightLine(dense))).toBe(true);
    expect(unpricedOverweight({ ...overweightLine(dense), amount: 80 })).toBe(false);
    expect(unpricedOverweight(freight)).toBe(false);
  });
});
