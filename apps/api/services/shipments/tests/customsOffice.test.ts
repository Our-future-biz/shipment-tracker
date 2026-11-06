import { describe, expect, it } from "vitest";
import { customsOfficeForProcedure } from "../lib/customsOffice";

const OFFICE = "CZ100000 Celní úřad v Brně, Brno";

describe("customsOfficeForProcedure", () => {
  it("leaves the office of a T1 alone", () => {
    expect(customsOfficeForProcedure("T1", OFFICE)).toEqual({});
    expect(customsOfficeForProcedure(" t1 ", OFFICE)).toEqual({});
    expect(customsOfficeForProcedure("T1", "")).toEqual({});
  });

  it("clears the office under any other procedure", () => {
    for (const procedure of ["SCP", "JSD", "C-Goods", "", null, undefined]) {
      expect(customsOfficeForProcedure(procedure, OFFICE)).toEqual({ customsOffice: "" });
    }
  });

  it("changes nothing where there is no office to clear", () => {
    expect(customsOfficeForProcedure("SCP", "")).toEqual({});
    expect(customsOfficeForProcedure("SCP", null)).toEqual({});
    expect(customsOfficeForProcedure("SCP", undefined)).toEqual({});
  });
});
