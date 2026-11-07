import { describe, expect, it } from "vitest";
import { CUSTOMS_OFFICES, customsProcedureLocked, namesCustomsOffice } from "./customsOffices";

describe("the customs office list", () => {
  it("holds the 49 offices the company works with, each a code and a name, each once", () => {
    expect(CUSTOMS_OFFICES).toHaveLength(49);
    for (const office of CUSTOMS_OFFICES) expect(office).toMatch(/^CZ\d{6} \S/);
    expect(new Set(CUSTOMS_OFFICES.map((office) => office.slice(0, 8))).size).toBe(49);
  });

  it("keeps the names as the customs administration writes them", () => {
    expect(CUSTOMS_OFFICES).toContain("CZ100000 Celní úřad v Brně, Brno");
    expect(CUSTOMS_OFFICES).toContain("CZ521050 Oddělení CÚ celní Uhříněves, Praha 10");
  });
});

describe("namesCustomsOffice", () => {
  it("is T1 only", () => {
    expect(namesCustomsOffice("T1")).toBe(true);
    expect(namesCustomsOffice(" t1 ")).toBe(true);
    for (const other of ["SCP", "JSD", "C-Goods", "", null, undefined]) expect(namesCustomsOffice(other)).toBe(false);
  });
});

describe("customsProcedureLocked", () => {
  const office = "CZ510000 Celní úřad pro hlavní město Prahu, Praha";

  it("fixes a T1 with its office chosen for whoever may not change the office", () => {
    expect(customsProcedureLocked("T1", office, false)).toBe(true);
    expect(customsProcedureLocked("T1", office, true)).toBe(false);
  });

  it("leaves it open before an office is chosen, and off T1", () => {
    expect(customsProcedureLocked("T1", "", false)).toBe(false);
    expect(customsProcedureLocked("T1", null, false)).toBe(false);
    expect(customsProcedureLocked("SCP", office, false)).toBe(false);
  });
});
