import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (msg: string) => new Error(msg) } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: {} }));
vi.mock("../repositories/truckingLines.repository", () => ({ truckingLinesRepository: {} }));
vi.mock("../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../repositories/invoice.repository", () => ({ invoiceRepository: {} }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("~encore/clients", () => ({ quotes: {} }));
vi.mock("../repositories/quoteCostImport.repository", () => ({ quoteCostImportRepository: {} }));
vi.mock("../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn() }));

import { definedOnly, toDecimal } from "../lib/amounts";
import { buyingChanges, receiptChanges, sellingChanges, setsEstimate } from "../services/invoicing.service";

describe("toDecimal", () => {
  it("keeps undefined, clears blanks, keeps decimals", () => {
    expect(toDecimal(undefined, "x")).toBeUndefined();
    expect(toDecimal("  ", "x")).toBeNull();
    expect(toDecimal(" 1250.5 ", "x")).toBe("1250.5");
    expect(toDecimal("-3", "x")).toBe("-3");
    expect(toDecimal("1.123456", "roe", 6)).toBe("1.123456");
  });

  it("refuses what Postgres would reject instead of failing as a 500", () => {
    expect(() => toDecimal("1,5", "amount")).toThrow("amount must be a number");
    expect(() => toDecimal("1.234", "amount")).toThrow("at most 2 decimal places");
    expect(() => toDecimal("abc", "amount")).toThrow();
  });
});

describe("write changes", () => {
  it("leave out fields that weren't sent, so they don't overwrite stored values", () => {
    expect(definedOnly({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(buyingChanges({ vendor: "Maersk" })).toEqual({ vendor: "Maersk" });
  });

  it("carry sortOrder (undo keeps a line where it was) and clear blank amounts", () => {
    expect(buyingChanges({ sortOrder: 3, estAmount: "" })).toEqual({ sortOrder: 3, estAmount: null });
    expect(sellingChanges({ sortOrder: 0, qty: "2" })).toEqual({ sortOrder: 0, qty: "2" });
  });

  it("link the vendor to a picked supplier by its company id, clear it with \"\", and refuse anything else", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(buyingChanges({ vendor: "Maersk A/S", supplierCustomerId: id })).toEqual({ vendor: "Maersk A/S", supplierCustomerId: id });
    expect(buyingChanges({ vendor: "Typed", supplierCustomerId: "" })).toEqual({ vendor: "Typed", supplierCustomerId: null });
    expect(() => buyingChanges({ supplierCustomerId: "Maersk" })).toThrow(/supplierCustomerId must be a company id/);
  });
});

describe("received and paid (Council Outlay 7, step 6b)", () => {
  const now = new Date("2026-11-04T09:00:00Z");
  const today = "2026-11-04";
  const stored = (over = {}) => ({ received: false, receivedAt: null, paidOn: null, ...over });

  it("stamp when Received is ticked, keep the first stamp, and clear both when it is unticked", () => {
    expect(receiptChanges(stored(), { received: true }, now, today)).toEqual({ receivedAt: now });
    expect(receiptChanges(stored({ received: true, receivedAt: new Date("2026-10-01T08:00:00Z") }), { received: true }, now, today)).toEqual({});
    expect(receiptChanges(stored({ received: true, paidOn: "2026-10-20" }), { received: false }, now, today)).toEqual({ receivedAt: null, paidOn: null, paidAt: null, paidByUserId: null, paidBy: null });
    expect(receiptChanges(null, { received: true }, now, today)).toEqual({ receivedAt: now });
  });

  it("pay only a received cost, on a real day not after today, and take the payment back with \"\"", () => {
    expect(() => receiptChanges(stored(), buyingChanges({ paidOn: "2026-11-01" }), now, today)).toThrow(/Tick Received first/);
    expect(receiptChanges(stored({ received: true }), buyingChanges({ paidOn: "2026-11-01" }), now, today)).toEqual({ paidAt: now, paidByUserId: null, paidBy: null });
    // Who noted it and when are kept with the day (K6); taking it back clears them.
    expect(receiptChanges(stored({ received: true }), buyingChanges({ paidOn: "2026-11-01" }), now, today, { userId: "u1", email: "jana@ourfuture.biz" })).toEqual({
      paidAt: now,
      paidByUserId: "u1",
      paidBy: "jana@ourfuture.biz",
    });
    expect(receiptChanges(stored({ received: true, paidOn: "2026-11-01" }), buyingChanges({ paidOn: "" }), now, today)).toEqual({ paidOn: null, paidAt: null, paidByUserId: null, paidBy: null });
    expect(() => receiptChanges(stored({ received: true }), buyingChanges({ paidOn: "2026-11-05" }), now, today)).toThrow(/after today/);
    expect(receiptChanges(null, buyingChanges({ received: true, paidOn: "2026-11-04" } as never), now, today)).toEqual({ receivedAt: now, paidAt: now, paidByUserId: null, paidBy: null });
    expect(() => buyingChanges({ paidOn: "4.11.2026" })).toThrow(/paidOn must be a date/);
    expect(buyingChanges({ paidOn: "" })).toEqual({ paidOn: null });
  });
});

describe("setsEstimate", () => {
  it("is a write that gives a buying line an estimated quantity or amount", () => {
    expect(setsEstimate(buyingChanges({ estAmount: "150" }))).toBe(true);
    expect(setsEstimate(buyingChanges({ estQty: "1" }))).toBe(true);
  });

  it("is not a real cost, a currency, or an estimate cleared", () => {
    expect(setsEstimate(buyingChanges({ realQty: "1", realAmount: "160", realCurrency: "EUR", estCurrency: "EUR" }))).toBe(false);
    expect(setsEstimate(buyingChanges({ estAmount: "", estQty: "" }))).toBe(false);
  });
});
