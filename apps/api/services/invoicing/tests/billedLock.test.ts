import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const countOpenInvoices = vi.hoisted(() => vi.fn());
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: { countOpenInvoices } }));

import { assertNotBilled, leavesBuyingCostAlone } from "../lib/billedLock";

beforeEach(() => countOpenInvoices.mockReset());

describe("a billed shipment's costs", () => {
  it("are refused a change while an invoice is open", async () => {
    countOpenInvoices.mockResolvedValue(1);
    await expect(assertNotBilled("s", "c")).rejects.toThrow(/billed.*Credit the invoice/);
  });

  it("change freely with no invoice, or once every invoice is credited", async () => {
    countOpenInvoices.mockResolvedValue(0);
    await expect(assertNotBilled("s", "c")).resolves.toBeUndefined();
  });
});

describe("what still goes on a billed shipment", () => {
  it("on a buying row: its place, and that its invoice was received or paid", () => {
    expect(leavesBuyingCostAlone({ sortOrder: 2 })).toBe(true);
    expect(leavesBuyingCostAlone({ paidOn: "2026-11-09" })).toBe(true);
    expect(leavesBuyingCostAlone({ received: true })).toBe(true);
    expect(leavesBuyingCostAlone({ paidOn: undefined, sortOrder: 1 })).toBe(true);
  });

  it("on a buying row: the supplier it is linked to, so a late supplier invoice counts in what is owed", () => {
    expect(leavesBuyingCostAlone({ supplierCustomerId: "s1" })).toBe(true);
    expect(leavesBuyingCostAlone({ haulierId: "" })).toBe(true);
    // The typed vendor is the row's text: it stays.
    expect(leavesBuyingCostAlone({ vendor: "Maersk", supplierCustomerId: "s1" })).toBe(false);
  });

  it("not the money, the estimate or the words of a buying row", () => {
    expect(leavesBuyingCostAlone({ realAmount: "10" })).toBe(false);
    expect(leavesBuyingCostAlone({ estAmount: "10" })).toBe(false);
    expect(leavesBuyingCostAlone({ estCurrency: "EUR", sortOrder: 1 })).toBe(false);
    expect(leavesBuyingCostAlone({ invoiceNumber: "F1", paidOn: "" })).toBe(false);
  });
});
