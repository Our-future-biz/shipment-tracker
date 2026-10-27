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

describe("chargeOptions by freight mode", () => {
  const offered = (mode: string) => chargeOptions(undefined, mode).map((o) => o.value);

  it("offers the mode's sheet, the customs charges, Insurance and Other", () => {
    const air = offered("Air");
    expect(air).toEqual(expect.arrayContaining(["air_freight", "air_fuel", "customs_import", "insurance", "other"]));
    expect(air).not.toContain("ocean_freight");
    expect(air).not.toContain("road_fuel");
  });

  it("shares a charge two sheets both name", () => {
    expect(offered("Sea FCL")).toContain("ams_ens");
    expect(offered("Sea LCL")).toContain("ams_ens");
    expect(offered("Road")).toContain("waiting_time");
    expect(offered("Rail")).toContain("waiting_time");
  });

  it("reads a shipment's freight mode as all its quote modes", () => {
    const sea = offered("Sea Freight");
    expect(sea).toEqual(expect.arrayContaining(["fcl_baf", "lcl_fuel", "bb_bunker"]));
    expect(sea).not.toContain("air_freight");
    expect(offered("Road Freight")).toContain("road_toll");
  });

  it("offers everything for no mode or one not known", () => {
    expect(offered("")).toEqual(chargeOptions().map((o) => o.value));
    expect(offered("Courier")).toEqual(chargeOptions().map((o) => o.value));
  });

  it("keeps a line's charge of another mode, shown readably", () => {
    expect(chargeOptions("air_fuel", "Road").at(-1)).toEqual({ value: "air_fuel", label: "Fuel surcharge (FSC)" });
  });
});

describe("toChargeCode / chargeLabel", () => {
  it("read a label as its code and show a code as its label", () => {
    expect(toChargeCode("Road toll surcharge")).toBe("road_toll");
    expect(chargeLabel("road_freight")).toBe("Basic freight / linehaul");
    expect(chargeLabel("Road toll surcharge")).toBe("Road toll surcharge");
  });

  it("read the older catalogue's names as their codes", () => {
    expect(toChargeCode("Road freight")).toBe("road_freight");
    expect(toChargeCode("Ocean freight")).toBe("ocean_freight");
    expect(chargeLabel("handling")).toBe("Handling");
  });
});
