import { describe, expect, it } from "vitest";
import { CUSTOMS_OFFICES, namesCustomsOffice } from "./customsOffices";

describe("the customs office list", () => {
  it("holds the 535 live offices, each a code and a name, each once", () => {
    expect(CUSTOMS_OFFICES).toHaveLength(535);
    for (const office of CUSTOMS_OFFICES) expect(office).toMatch(/^CZ\d{6} \S/);
    expect(new Set(CUSTOMS_OFFICES.map((office) => office.slice(0, 8))).size).toBe(535);
  });

  it("keeps the names as the customs administration writes them", () => {
    expect(CUSTOMS_OFFICES).toContain("CZ100000 Celní úřad v Brně, Brno");
  });
});

describe("namesCustomsOffice", () => {
  it("is T1 only", () => {
    expect(namesCustomsOffice("T1")).toBe(true);
    expect(namesCustomsOffice(" t1 ")).toBe(true);
    for (const other of ["SCP", "JSD", "C-Goods", "", null, undefined]) expect(namesCustomsOffice(other)).toBe(false);
  });
});
