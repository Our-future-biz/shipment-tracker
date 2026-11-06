import { describe, expect, it } from "vitest";
import { customsOfficeForProcedure, customsOfficeLockRefusal, customsOfficeShapeRefusal } from "../lib/customsOffice";

const OFFICE = "CZ100000 Celní úřad v Brně, Brno";

describe("customsOfficeLockRefusal", () => {
  const chosen = { customsProcedure: "T1", customsOffice: OFFICE };

  it("lets a regular user choose the first office", () => {
    expect(customsOfficeLockRefusal({ customsProcedure: "T1", customsOffice: "" }, { customsOffice: OFFICE }, "user")).toBeNull();
    expect(customsOfficeLockRefusal({ customsProcedure: "", customsOffice: "" }, { customsProcedure: "SCP" }, "user")).toBeNull();
  });

  it("refuses a regular user changing or clearing a chosen office", () => {
    expect(customsOfficeLockRefusal(chosen, { customsOffice: "CZ200000 Liberec" }, "user")).toContain("manager's approval");
    expect(customsOfficeLockRefusal(chosen, { customsOffice: "" }, "user")).toContain("manager's approval");
  });

  it("refuses a regular user leaving T1 once the office is chosen, as that would clear it", () => {
    expect(customsOfficeLockRefusal(chosen, { customsProcedure: "SCP" }, "user")).toContain("only a manager");
    expect(customsOfficeLockRefusal(chosen, { customsProcedure: "" }, "user")).toContain("only a manager");
  });

  it("leaves a regular user's other edits alone, and a write of what is already there", () => {
    expect(customsOfficeLockRefusal(chosen, {}, "user")).toBeNull();
    expect(customsOfficeLockRefusal(chosen, { customsOffice: OFFICE, customsProcedure: "T1" }, "user")).toBeNull();
  });

  it("does not hold a manager to it", () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      expect(customsOfficeLockRefusal(chosen, { customsOffice: "CZ200000 Liberec" }, role)).toBeNull();
      expect(customsOfficeLockRefusal(chosen, { customsProcedure: "SCP" }, role)).toBeNull();
    }
  });
});

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

describe("customsOfficeShapeRefusal", () => {
  it("takes an office from the list, or none", () => {
    expect(customsOfficeShapeRefusal(OFFICE)).toBeNull();
    expect(customsOfficeShapeRefusal("")).toBeNull();
    expect(customsOfficeShapeRefusal(undefined)).toBeNull();
    expect(customsOfficeShapeRefusal(null)).toBeNull();
  });

  it("refuses a typed one", () => {
    expect(customsOfficeShapeRefusal("Praha")).toMatch(/from the list/);
    expect(customsOfficeShapeRefusal("CZ51 Praha")).toMatch(/from the list/);
  });
});
