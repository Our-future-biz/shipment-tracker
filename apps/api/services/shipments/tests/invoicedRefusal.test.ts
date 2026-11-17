import { describe, expect, it } from "vitest";
import { invoicedRefusal, isInvoicedStatus } from "../lib/shipmentEditRule";

describe("invoicedRefusal", () => {
  it("lets Invoiced through only when every charge is invoiced", () => {
    expect(invoicedRefusal({ invoiced: 3, total: 3 })).toBeNull();
    expect(invoicedRefusal({ invoiced: 1, total: 3 })).toBe("Not all charges are invoiced: 1 of 3 selling lines are on an invoice. Invoice the rest first");
    expect(invoicedRefusal({ invoiced: 0, total: 0 })).toMatch(/no charges to invoice/);
  });
});

describe("isInvoicedStatus", () => {
  it("reads Invoiced however it is written, and nothing else", () => {
    expect(isInvoicedStatus("Invoiced")).toBe(true);
    expect(isInvoicedStatus(" invoiced ")).toBe(true);
    expect(isInvoicedStatus("Not Invoiced")).toBe(false);
    expect(isInvoicedStatus(undefined)).toBe(false);
  });
});
