import { describe, expect, it } from "vitest";
import { supplierOwed, type OwedCostLine, type OwedHaulierInvoice } from "./supplierOwed";

const TODAY = "2026-11-04";
const line = (over: Partial<OwedCostLine> = {}): OwedCostLine => ({
  id: "c1", shipmentId: "s1", jobNumber: "CZ00000021", description: "Ocean freight", category: "ocean_freight", invoiceNumber: "INV-1",
  received: true, receivedAt: "2026-10-01T08:00:00Z", amount: 100, currency: "EUR", ...over,
});
const invoice = (over: Partial<OwedHaulierInvoice> = {}): OwedHaulierInvoice => ({
  id: "h1", invoiceNumber: "FV-9", status: "APPROVED", issueDate: "2026-10-20", dueDate: "2026-11-03", totalGross: 5000, currency: "CZK", payment: null, ...over,
});

describe("what we owe a supplier", () => {
  it("is due its payment days after the line was received, and overdue once that day is past", () => {
    const { owed, totals } = supplierOwed([line(), line({ id: "c2", receivedAt: "2026-10-30T08:00:00Z", amount: 50 })], [], 30, TODAY);
    expect(owed.map((i) => [i.key, i.receivedOn, i.dueOn, i.overdueDays])).toEqual([
      ["cost:c1", "2026-10-01", "2026-10-31", 4],
      ["cost:c2", "2026-10-30", "2026-11-29", 0],
    ]);
    expect(totals).toEqual([{ currency: "EUR", owed: 150, overdue: 100, expected: 0 }]);
  });

  it("is not overdue on its due day itself", () => {
    expect(supplierOwed([line({ receivedAt: "2026-10-05T08:00:00Z" })], [], 30, TODAY).owed[0]).toMatchObject({ dueOn: TODAY, overdueDays: 0 });
  });

  it("does not know the due day without payment days, or for a line received before the day was kept", () => {
    const res = supplierOwed([line(), line({ id: "c2", receivedAt: null })], [], null, TODAY);
    expect(res.owed.every((i) => i.dueOn === "" && i.overdueDays === 0)).toBe(true);
    expect(res.dueUnknown).toBe(2);
    expect(supplierOwed([line({ receivedAt: null })], [], 30, TODAY).owed[0]).toMatchObject({ receivedOn: "", dueOn: "" });
  });

  it("counts a received line with no real cost typed apart, not in the total", () => {
    const res = supplierOwed([line(), line({ id: "c2", amount: null })], [], 30, TODAY);
    expect(res.withoutAmount).toBe(1);
    expect(res.totals[0]!.owed).toBe(100);
  });

  it("keeps what is expected apart from what is owed, and totals each currency on its own", () => {
    const res = supplierOwed(
      [line(), line({ id: "e1", received: false, receivedAt: null, amount: 70, invoiceNumber: "" }), line({ id: "e2", received: false, receivedAt: null, amount: 1000, currency: "CZK" })],
      [],
      30,
      TODAY,
    );
    expect(res.owed.map((i) => i.key)).toEqual(["cost:c1"]);
    expect(res.expected.map((i) => [i.key, i.dueOn])).toEqual([
      ["cost:e1", ""],
      ["cost:e2", ""],
    ]);
    expect(res.totals).toEqual([
      { currency: "EUR", owed: 100, overdue: 100, expected: 70 },
      { currency: "CZK", owed: 0, overdue: 0, expected: 1000 },
    ]);
  });

  it("owes a haulier its approved Trucking invoices until they are paid, by their own due day", () => {
    const res = supplierOwed(
      [],
      [invoice(), invoice({ id: "h2", payment: { paidOn: "2026-11-01" } }), invoice({ id: "h3", status: "MATCHED" }), invoice({ id: "h4", dueDate: null })],
      30,
      TODAY,
    );
    expect(res.owed.map((i) => [i.key, i.href, i.dueOn, i.overdueDays])).toEqual([
      ["haulier-invoice:h1", "/trucking/haulier-invoices/h1", "2026-11-03", 1],
      ["haulier-invoice:h4", "/trucking/haulier-invoices/h4", "", 0],
    ]);
    expect(res.totals).toEqual([{ currency: "CZK", owed: 10000, overdue: 5000, expected: 0 }]);
  });

  it("links a cost line to its shipment's Costs Breakdown and lists the most overdue first", () => {
    const res = supplierOwed([line({ id: "late", receivedAt: "2026-09-01T08:00:00Z" }), line()], [], 30, TODAY);
    expect(res.owed.map((i) => i.key)).toEqual(["cost:late", "cost:c1"]);
    expect(res.owed[0]!.href).toBe("/shipments/s1?tab=costs");
  });
});
