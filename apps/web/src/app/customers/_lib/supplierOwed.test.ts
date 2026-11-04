import { describe, expect, it } from "vitest";
import { supplierOwed, type OwedCostLine, type OwedCosts, type OwedHaulierInvoiceLine } from "./supplierOwed";

const line = (over: Partial<OwedCostLine> = {}): OwedCostLine => ({
  id: "c1", shipmentId: "s1", jobNumber: "CZ00000021", description: "Ocean freight", category: "ocean_freight", invoiceNumber: "INV-1",
  kind: "owed", receivedAt: "2026-10-01T08:00:00Z", dueOn: "2026-10-31", overdueDays: 4, amount: 100, currency: "EUR", ...over,
});
const invoice = (over: Partial<OwedHaulierInvoiceLine> = {}): OwedHaulierInvoiceLine => ({
  id: "h1", invoiceNumber: "FV-9", kind: "owed", issueDate: "2026-10-20", dueOn: "2026-11-03", overdueDays: 1, amount: 5000, currency: "CZK", ...over,
});
const NO_INVOICES: OwedCosts["haulierInvoices"] = { status: "none", owed: [], untracked: [], totals: [], counts: { owed: 0, untracked: 0, dueUnknown: 0 }, truncated: false };
const costs = (over: Partial<OwedCosts> = {}): OwedCosts => ({
  owed: [], expected: [], untracked: [], totals: [], counts: { owed: 0, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 }, haulierInvoices: NO_INVOICES, ...over,
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
    );
    expect(res.totals).toEqual([{ currency: "EUR", costs: { owed: 900, overdue: 400, expected: 70, untracked: 0 }, invoices: null }]);
    expect(res.counts).toEqual({ owed: 12, expected: 1, untracked: 0 });
    expect(res.owed[0]).toMatchObject({ key: "cost:c1", href: "/shipments/s1?tab=costs", vat: "without", overdueDays: 4 });
    expect(res.expected.map((i) => i.key)).toEqual(["cost:e1"]);
    expect(res.haulierInvoices).toBe("none");
  });

  it("owes a haulier the unpaid Trucking invoices the server hands, with VAT, by their own due day, and never adds them to the costs (C-1, C-9)", () => {
    const res = supplierOwed(
      costs({
        owed: [line({ overdueDays: 0, dueOn: "2026-11-20" })],
        totals: [{ currency: "EUR", owed: 100, overdue: 0, expected: 0, untracked: 0 }],
        counts: { owed: 1, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 },
        haulierInvoices: {
          status: "included",
          owed: [invoice(), invoice({ id: "h4", dueOn: "", overdueDays: 0, currency: "EUR", amount: 50 })],
          untracked: [],
          totals: [
            { currency: "CZK", owed: 5000, overdue: 5000, untracked: 0 },
            { currency: "EUR", owed: 50, overdue: 0, untracked: 0 },
          ],
          counts: { owed: 40, untracked: 0, dueUnknown: 1 },
          truncated: false,
        },
      }),
    );
    expect(res.owed.map((i) => [i.key, i.vat, i.overdueDays, i.href])).toEqual([
      ["haulier-invoice:h1", "with", 1, "/trucking/haulier-invoices/h1"],
      ["cost:c1", "without", 0, "/shipments/s1?tab=costs"],
      ["haulier-invoice:h4", "with", 0, "/trucking/haulier-invoices/h4"],
    ]);
    // One currency held by both: the two figures stay apart.
    expect(res.totals).toEqual([
      { currency: "CZK", costs: null, invoices: { owed: 5000, overdue: 5000, untracked: 0 } },
      { currency: "EUR", costs: { owed: 100, overdue: 0, expected: 0, untracked: 0 }, invoices: { owed: 50, overdue: 0, untracked: 0 } },
    ]);
    expect(res.counts.owed).toBe(41);
    expect(res.invoicesDueUnknown).toBe(1);
    expect(res.haulierInvoices).toBe("included");
  });

  it("lists what came before payment tracking apart, never in what is owed or overdue (K2)", () => {
    const res = supplierOwed(
      costs({
        untracked: [line({ id: "old", kind: "untracked", receivedAt: null, dueOn: "", overdueDays: 0, amount: 30 })],
        totals: [{ currency: "EUR", owed: 0, overdue: 0, expected: 0, untracked: 30 }],
        counts: { owed: 0, expected: 0, untracked: 1, withoutAmount: 0, dueUnknown: 0 },
        haulierInvoices: {
          ...NO_INVOICES,
          status: "included",
          untracked: [invoice({ kind: "untracked", overdueDays: 0 })],
          totals: [{ currency: "CZK", owed: 0, overdue: 0, untracked: 5000 }],
          counts: { owed: 0, untracked: 1, dueUnknown: 0 },
        },
      }),
    );
    expect(res.owed).toEqual([]);
    expect(res.untracked.map((i) => [i.key, i.overdueDays])).toEqual([
      ["cost:old", 0],
      ["haulier-invoice:h1", 0],
    ]);
    expect(res.totals).toEqual([
      { currency: "CZK", costs: null, invoices: { owed: 0, overdue: 0, untracked: 5000 } },
      { currency: "EUR", costs: { owed: 0, overdue: 0, expected: 0, untracked: 30 }, invoices: null },
    ]);
    expect(res.counts.untracked).toBe(2);
  });

  it("says when a haulier's Trucking invoices are left out, or could not be read (E-10)", () => {
    expect(supplierOwed(costs({ haulierInvoices: { ...NO_INVOICES, status: "hidden" } })).haulierInvoices).toBe("hidden");
    expect(supplierOwed(costs({ haulierInvoices: { ...NO_INVOICES, status: "unavailable" } })).haulierInvoices).toBe("unavailable");
    expect(supplierOwed(costs({ haulierInvoices: { ...NO_INVOICES, status: "included", truncated: true } })).invoicesTruncated).toBe(true);
  });
});
