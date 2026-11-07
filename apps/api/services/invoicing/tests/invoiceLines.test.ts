import { describe, expect, it } from "vitest";
import { invoiceLineProblem, invoiceRows, type InvoicePostLine } from "../lib/invoiceLines";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const line = (over: Partial<InvoicePostLine> = {}): InvoicePostLine => ({ category: "ocean_freight", amount: "100.00", currency: "USD", shipmentId: A, ...over });

// Rows of the debit note AS260707595: two of its B/Ls, one with two CFS charges.
const debitNote: InvoicePostLine[] = [
  line({ item: "OCEAN FREIGHT(D)", amount: "109.00", shipmentId: A }),
  line({ item: "OCEAN FREIGHT(D)", amount: "1177.20", shipmentId: B }),
  line({ item: "CFS CHARGES", category: "cfs_destination", amount: "18.00", shipmentId: B }),
  line({ item: "CFS CHARGES", category: "cfs_destination", amount: "151.20", shipmentId: B }),
];

describe("the rows an invoice comes to", () => {
  it("puts each line on the shipment its B/L names, one row per charge", () => {
    expect(invoiceRows(debitNote)).toEqual([
      { shipmentId: A, category: "ocean_freight", amount: "109.00", currency: "USD", description: "OCEAN FREIGHT(D)" },
      { shipmentId: B, category: "ocean_freight", amount: "1177.20", currency: "USD", description: "OCEAN FREIGHT(D)" },
      { shipmentId: B, category: "cfs_destination", amount: "169.20", currency: "USD", description: "CFS CHARGES" },
    ]);
  });

  it("adds up to the lines' total, to the cent", () => {
    const total = invoiceRows(debitNote).reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0);
    expect(total).toBe(145540);
  });

  it("shares a line with no shipment out by its weights, to the cent", () => {
    const rows = invoiceRows([line({ shipmentId: undefined, amount: "100.00", split: [{ shipmentId: A, weight: 2 }, { shipmentId: B, weight: 1 }] })]);
    expect(rows.map((r) => [r.shipmentId, r.amount])).toEqual([[A, "66.67"], [B, "33.33"]]);
  });

  it("adds a shared part to what the shipment already gets under the charge", () => {
    const rows = invoiceRows([line({ amount: "50.00" }), line({ shipmentId: undefined, amount: "10.00", split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 1 }] })]);
    expect(rows.map((r) => [r.shipmentId, r.amount])).toEqual([[A, "55.00"], [B, "5.00"]]);
  });

  it("gives a shipment of weight 0 nothing", () => {
    const rows = invoiceRows([line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }, { shipmentId: B, weight: 0 }] })]);
    expect(rows.map((r) => r.shipmentId)).toEqual([A]);
  });

  it("keeps two currencies of one charge apart", () => {
    expect(invoiceRows([line(), line({ currency: "eur" })]).map((r) => r.currency)).toEqual(["USD", "EUR"]);
  });

  it("takes a credit off, and leaves out a charge it cancels", () => {
    expect(invoiceRows([line({ amount: "100.00" }), line({ amount: "-30.00" })])[0]!.amount).toBe("70.00");
    expect(invoiceRows([line({ amount: "100.00" }), line({ amount: "-100.00" })])).toEqual([]);
  });

  it("names each charge once in the description", () => {
    const rows = invoiceRows([line({ item: "CFS" }), line({ item: "CFS" }), line({ item: "HANDLING" })]);
    expect(rows[0]!.description).toBe("CFS, HANDLING");
  });
});

describe("a line that can't be posted", () => {
  it("has no amount, a 0 or no number", () => {
    for (const amount of ["", "0", "abc"]) expect(invoiceLineProblem(line({ amount, item: "POD COST" }))).toContain("POD COST");
  });

  it("has no currency or charge", () => {
    expect(invoiceLineProblem(line({ currency: " " }))).toContain("currency");
    expect(invoiceLineProblem(line({ category: "" }))).toContain("charge");
  });

  it("has nobody to go to", () => {
    expect(invoiceLineProblem(line({ shipmentId: undefined }))).toContain("no shipment");
    expect(invoiceLineProblem(line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 0 }] }))).toContain("no shipment");
  });

  it("is fine with a shipment, a credit, or a share", () => {
    expect(invoiceLineProblem(line())).toBeNull();
    expect(invoiceLineProblem(line({ amount: "-5.00" }))).toBeNull();
    expect(invoiceLineProblem(line({ shipmentId: undefined, split: [{ shipmentId: A, weight: 1 }] }))).toBeNull();
  });
});
