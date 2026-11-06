import { describe, expect, it } from "vitest";
import { carrierCodeOf } from "../lib/carriers";

describe("carrierCodeOf", () => {
  it("knows a carrier however it is written", () => {
    expect(carrierCodeOf("Maersk")).toBe("MAEU");
    expect(carrierCodeOf("MAERSK LINE A/S")).toBe("MAEU");
    expect(carrierCodeOf("Hapag-Lloyd")).toBe("HLCU");
    expect(carrierCodeOf("cma cgm")).toBe("CMDU");
    expect(carrierCodeOf("  Evergreen Marine ")).toBe("EGLV");
    expect(carrierCodeOf("Ocean Network Express")).toBe("ONEY");
    expect(carrierCodeOf("ONE")).toBe("ONEY");
  });

  it("takes a code typed as the code", () => {
    expect(carrierCodeOf("msc")).toBe("MSCU");
    expect(carrierCodeOf("hlcu")).toBe("HLCU");
  });

  it("gives a co-loader or anything unknown no code", () => {
    expect(carrierCodeOf("Vanguard Logistics")).toBe("");
    expect(carrierCodeOf("One Logistics")).toBe("");
    expect(carrierCodeOf("Zimmer Transport")).toBe("");
    expect(carrierCodeOf("")).toBe("");
    expect(carrierCodeOf(null)).toBe("");
  });
});
