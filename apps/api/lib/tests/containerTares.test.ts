import { describe, expect, it } from "vitest";
import { containerLengthFt, containerTareKg } from "../containerTares";

describe("container tares", () => {
  it("gives the tare of every container type quotes offer", () => {
    const types = ["20' DC", "20' RF", "20' OT", "20' HOT", "20' FR", "40' DC", "40' HC", "40' HRF", "40' OT", "40' HOT", "40' FR", "40' HFR", "45' HQ"];
    expect(types.filter((t) => containerTareKg(t) === null)).toEqual([]);
    expect(containerTareKg("20' DC")).toBe(2300);
    expect(containerTareKg("40' HC")).toBe(4000);
    expect(containerTareKg("40' HRF")).toBe(5300);
    expect(containerTareKg("45' HQ")).toBe(4400);
  });

  it("reads a dry box saved as GP as the DC of today, and knows no tare of a type it does not list", () => {
    expect(containerTareKg("40' GP")).toBe(3700);
    expect(containerTareKg("53' DC")).toBeNull();
    expect(containerTareKg(undefined)).toBeNull();
  });

  it("reads the length from the type", () => {
    expect(containerLengthFt("20' OT")).toBe(20);
    expect(containerLengthFt("45' HQ")).toBe(45);
    expect(containerLengthFt("Pallet")).toBeNull();
  });
});
