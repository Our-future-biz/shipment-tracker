import { describe, expect, it } from "vitest";
import { linkedSupplierIds, supplierGate, type LinkedSupplierState } from "../../utils/supplierApproval.utils";

const A = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const B = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const quote = { buyingLines: [{ supplier: "Typed only" }, { supplier: "DANGO", supplierCustomerId: A.toUpperCase() }, { supplier: "Other", supplierCustomerId: B }, { supplierCustomerId: A }] };
const states = (a: LinkedSupplierState["status"], comment = "") =>
  new Map<string, LinkedSupplierState>([
    [A, { companyName: "DANGO s.r.o.", status: a, comment }],
    [B, { companyName: "Other a.s.", status: "", comment: "" }],
  ]);

describe("linkedSupplierIds", () => {
  it("are the companies the buying lines are linked to, each once", () => {
    expect(linkedSupplierIds(quote)).toEqual([A, B]);
    expect(linkedSupplierIds({})).toEqual([]);
    expect(linkedSupplierIds(null)).toEqual([]);
  });
});

describe("supplierGate", () => {
  it("holds a quote linked to a supplier that waits for a manager", () => {
    expect(supplierGate(quote, states("pending")).message).toMatch(/^The new supplier DANGO s\.r\.o\. waits for a manager's approval/);
  });
  it("holds a quote linked to a declined supplier, saying why", () => {
    expect(supplierGate(quote, states("declined", "Unknown company")).message).toBe(
      "A manager declined the supplier DANGO s.r.o. (Unknown company) — pick another supplier on its buying line",
    );
  });
  it("lets an approved, deleted or unknown supplier go", () => {
    for (const s of ["", "missing"] as const) expect(supplierGate(quote, states(s))).toEqual({ message: null, unknown: false });
  });
  it("says when a line is linked to a supplier nobody looked up", () => {
    expect(supplierGate(quote, new Map()).unknown).toBe(true);
  });
});
