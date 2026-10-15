import { describe, expect, it } from "vitest";
import { chargeLabel, chargeOptions, toChargeCode } from "./chargeCodes";

describe("chargeOptions", () => {
  it("offers the codes, not the older generic keys", () => {
    const values = chargeOptions().map((o) => o.value);
    expect(values).toContain("road_freight");
    expect(values).not.toContain("freight");
  });

  it("adds a value the line holds that is not offered, shown readably", () => {
    expect(chargeOptions("freight").at(-1)).toEqual({ value: "freight", label: "Freight" });
    expect(chargeOptions("Courier").at(-1)).toEqual({ value: "Courier", label: "Courier" });
    expect(chargeOptions("road_freight")).toEqual(chargeOptions());
  });
});

describe("toChargeCode / chargeLabel", () => {
  it("read a label as its code and show a code as its label", () => {
    expect(toChargeCode("Road freight")).toBe("road_freight");
    expect(chargeLabel("road_freight")).toBe("Road freight");
    expect(chargeLabel("Road freight")).toBe("Road freight");
  });
});
