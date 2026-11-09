import { describe, expect, it } from "vitest";
import { customerGate, linkedSupplierIds, supplierGate, typedSupplierLines, typedSupplierMessage, type LinkedSupplierState } from "../../utils/supplierApproval.utils";

const A = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const B = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const quote = { buyingLines: [{ supplier: "" }, { supplier: "DANGO", supplierCustomerId: A.toUpperCase() }, { supplier: "Other", supplierCustomerId: B }, { supplierCustomerId: A }] };
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
  it("holds a quote with a supplier only typed, naming the line", () => {
    const typed = { buyingLines: [...quote.buyingLines, { type: "Road freight", supplier: " Typed s.r.o. ", supplierCustomerId: "not-an-id" }] };
    expect(supplierGate(typed, states(""))).toEqual({
      message: "The supplier of the buying line Road freight (Typed s.r.o.) is only typed — pick it from the Customer Database on Pricing (or add it there)",
      unknown: false,
    });
    // One waiting is said first: it is what the user waits for.
    expect(supplierGate(typed, states("pending")).message).toMatch(/^The new supplier DANGO/);
  });
  it("says when a line is linked to a supplier nobody looked up", () => {
    expect(supplierGate(quote, new Map()).unknown).toBe(true);
  });
});

describe("typedSupplierLines", () => {
  it("are the lines naming a supplier with no company behind it; a tariff's line keeps the tariff's supplier", () => {
    const data = {
      buyingLines: [
        { type: "Road freight", supplier: "DANGO" },
        { type: "", description: "Customs", supplier: "Celní" },
        { supplier: "Linked", supplierCustomerId: A },
        { type: "Rail freight", supplier: "Rail Cargo", tariffRef: "rail:v1:r1" },
        { type: "THC", supplier: "  " },
        { supplier: "Nameless" },
      ],
    };
    expect(typedSupplierLines(data)).toEqual([
      { charge: "Road freight", supplier: "DANGO" },
      { charge: "Customs", supplier: "Celní" },
      { charge: "a charge", supplier: "Nameless" },
    ]);
    expect(typedSupplierLines({})).toEqual([]);
  });
  it("are named in one message, or none", () => {
    expect(typedSupplierMessage([])).toBeNull();
    expect(typedSupplierMessage([{ charge: "Road freight", supplier: "DANGO" }, { charge: "Customs", supplier: "Celní" }])).toBe(
      "The suppliers of the buying lines Road freight (DANGO), Customs (Celní) are only typed — pick each from the Customer Database on Pricing (or add it there)",
    );
  });
});

describe("customerGate", () => {
  const ID = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
  const states = (status: "" | "pending" | "declined" | "missing") => new Map([[ID, { companyName: "DANGO s.r.o.", status, comment: status === "declined" ? "not ours" : "" }]]);

  it("holds a quote for a company that waits for a manager, or that a manager declined", () => {
    expect(customerGate({ customerId: ID }, states("pending")).message).toMatch(/^DANGO s\.r\.o\. waits for a manager's approval/);
    expect(customerGate({ customerId: ID }, states("declined")).message).toMatch(/^A manager declined DANGO s\.r\.o\. \(not ours\)/);
  });

  it("lets every other customer go, and a quote without one", () => {
    expect(customerGate({ customerId: ID }, states("")).message).toBeNull();
    expect(customerGate({ customerId: ID }, states("missing")).message).toBeNull();
    expect(customerGate({ customerName: "typed" }, new Map())).toEqual({ message: null, unknown: false });
  });

  it("says when the customer changed since the states were read", () => {
    expect(customerGate({ customerId: ID }, new Map())).toEqual({ message: null, unknown: true });
  });
});
