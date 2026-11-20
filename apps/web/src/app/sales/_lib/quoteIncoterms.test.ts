import { describe, expect, it } from "vitest";
import { INCOTERMS } from "@/lib/incoterms";
import { INCOTERMS_2020, quoteIncoterms } from "./quoteIncoterms";

describe("the Incoterms a quote offers (User Council S18)", () => {
  it("are every rule, in the rules' order: DAP before DPU, the sea-only terms last", () => {
    expect(quoteIncoterms({ serviceType: "Sea FCL" })).toEqual(["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"]);
    expect([...INCOTERMS_2020].sort()).toEqual([...INCOTERMS].sort());
  });

  it("leave the sea-only terms off an air, rail or road quote", () => {
    for (const serviceType of ["Air", "Rail", "Road"]) expect(quoteIncoterms({ serviceType })).toEqual(["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"]);
    expect(quoteIncoterms({})).toHaveLength(11);
  });

  it("keep the code a quote already has, so it shows until another is picked", () => {
    expect(quoteIncoterms({ serviceType: "Air", incoterm: "FOB" }).at(-1)).toBe("FOB");
    expect(quoteIncoterms({ serviceType: "Air", incoterm: "DAP" })).toHaveLength(7);
  });
});
