import { describe, expect, it } from "vitest";
import { supplierOwed, type OwedCostLine, type OwedCosts, type OwedHaulierInvoice } from "./supplierOwed";

const TODAY = "2026-11-04";
const line = (over: Partial<OwedCostLine> = {}): OwedCostLine => ({
  id: "c1", shipmentId: "s1", jobNumber: "CZ00000021", description: "Ocean freight", category: "ocean_freight", invoiceNumber: "INV-1",
  kind: "owed", receivedAt: "2026-10-01T08:00:00Z", dueOn: "2026-10-31", overdueDays: 4, amount: 100, currency: "EUR", ...over,
});
const costs = (over: Partial<OwedCosts> = {}): OwedCosts => ({
  owed: [], expected: [], untracked: [], totals: [], counts: { owed: 0, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 }, ...over,
});
const invoice = (over: Partial<OwedHaulierInvoice> = {}): OwedHaulierInvoice => ({
  id: "h1", invoiceNumber: "FV-9", status: "APPROVED", issueDate: "2026-10-20", dueDate: "2026-11-03", totalGross: 5000, currency: "CZK", payment: null, paymentTracked: true, ...over,
});

describe("what we owe a supplier", () => {
  it("takes the cost lines' totals from the server, which covers every line, and links each line to its Costs Breakdown", () => {
    const res = supplierOwed(
      costs({
        owed: [line()],
        expected: [line({ id: "e1", kind: "expected", receivedAt: null, dueOn: "", overdueDays: 0, amount: 70 })],
        totals: [{ currency: "EUR", owed: 900, overdue: 400, expected: 70, untracked: 0 }],
        counts: { owed: 12, expected: 1, untracked: 0, withoutAmount: 0, dueUnknown: 0 },
      }),
      [],
      TODAY,
    );
    expect(res.totals).toEqual([{ currency: "EUR", owed: 900, overdue: 400, fromCosts: 900, fromInvoices: 0, expected: 70, untracked: 0 }]);
    expect(res.counts).toEqual({ owed: 12, expected: 1, untracked: 0 });
    expect(res.owed[0]).toMatchObject({ key: "cost:c1", href: "/shipments/s1?tab=costs", vat: "without", overdueDays: 4 });
    expect(res.expected.map((i) => i.key)).toEqual(["cost:e1"]);
  });

  it("owes a haulier its approved Trucking invoices until they are paid, with VAT, by their own due day", () => {
    const res = supplierOwed(
      costs({ owed: [line({ overdueDays: 0, dueOn: "2026-11-20" })], totals: [{ currency: "EUR", owed: 100, overdue: 0, expected: 0, untracked: 0 }], counts: { owed: 1, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 } }),
      [invoice(), invoice({ id: "h2", payment: { paidOn: "2026-11-01" } }), invoice({ id: "h3", status: "MATCHED" }), invoice({ id: "h4", dueDate: null, currency: "EUR", totalGross: 50 })],
      TODAY,
    );
    expect(res.owed.map((i) => [i.key, i.vat, i.overdueDays])).toEqual([
      ["haulier-invoice:h1", "with", 1],
      ["cost:c1", "without", 0],
      ["haulier-invoice:h4", "with", 0],
    ]);
    expect(res.totals).toEqual([
      { currency: "CZK", owed: 5000, overdue: 5000, fromCosts: 0, fromInvoices: 5000, expected: 0, untracked: 0 },
      { currency: "EUR", owed: 150, overdue: 0, fromCosts: 100, fromInvoices: 50, expected: 0, untracked: 0 },
    ]);
    expect(res.counts.owed).toBe(3);
    expect(res.invoicesDueUnknown).toBe(1);
  });

  it("lists what came before payment tracking apart, never in what is owed or overdue (K2)", () => {
    const res = supplierOwed(
      costs({
        untracked: [line({ id: "old", kind: "untracked", receivedAt: null, dueOn: "", overdueDays: 0, amount: 30 })],
        totals: [{ currency: "EUR", owed: 0, overdue: 0, expected: 0, untracked: 30 }],
        counts: { owed: 0, expected: 0, untracked: 1, withoutAmount: 0, dueUnknown: 0 },
      }),
      [invoice({ paymentTracked: false })],
      TODAY,
    );
    expect(res.owed).toEqual([]);
    expect(res.untracked.map((i) => [i.key, i.overdueDays])).toEqual([
      ["cost:old", 0],
      ["haulier-invoice:h1", 0],
    ]);
    expect(res.totals).toEqual([
      { currency: "CZK", owed: 0, overdue: 0, fromCosts: 0, fromInvoices: 0, expected: 0, untracked: 5000 },
      { currency: "EUR", owed: 0, overdue: 0, fromCosts: 0, fromInvoices: 0, expected: 0, untracked: 30 },
    ]);
    expect(res.counts.untracked).toBe(2);
  });
});
