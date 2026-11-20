import { describe, expect, it } from "vitest";
import { chargeOptions } from "@/lib/chargeCodes";
import { chargeMatches } from "./chargeSearch";

const found = (typed: string, mode: string) => chargeOptions(undefined, mode).filter((o) => chargeMatches(typed, o)).map((o) => o.label);

describe("the quote's charge search", () => {
  it("finds the inland haulage by what the trade calls it (User Council S15)", () => {
    for (const typed of ["pre-carriage", "precarriage", "trucking", "truck", "pick-up", "pick up", "pickup", "carriage", "haul"]) {
      expect(found(typed, "Sea FCL")).toContain("Inland container haulage");
    }
  });

  it("still finds a charge by its own name, and everything with nothing typed", () => {
    expect(found("ocean", "Sea FCL")).toEqual(["Ocean freight (OF / BAS)"]);
    expect(found("truck", "Sea FCL")).toContain("Truck Waiting");
    expect(found("", "Sea FCL")).toHaveLength(chargeOptions(undefined, "Sea FCL").length);
  });

  it("finds the collection of an LCL or air quote the same way", () => {
    expect(found("pre-carriage", "Air")).toContain("Inland collection / delivery");
    expect(found("trucking", "Sea LCL")).toContain("Inland collection / delivery");
  });
});
