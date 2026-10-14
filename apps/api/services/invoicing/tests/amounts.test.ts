import { describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (msg: string) => new Error(msg) } }));
vi.mock("../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: {} }));
vi.mock("../repositories/additionalCharge.repository", () => ({ additionalChargeRepository: {} }));
vi.mock("../repositories/billingSettings.repository", () => ({ billingSettingsRepository: {} }));
vi.mock("../repositories/billingOverride.repository", () => ({ billingOverrideRepository: {} }));
vi.mock("../repositories/generatedInvoice.repository", () => ({ generatedInvoiceRepository: {} }));
vi.mock("../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
vi.mock("../repositories/customsInvoice.repository", () => ({ customsInvoiceLineRepository: {}, customsInvoiceRepository: {} }));
vi.mock("../repositories/exchangeRate.repository", () => ({ exchangeRateRepository: {} }));
vi.mock("../../../lib/shipmentRefs", () => ({ assertShipmentExists: vi.fn() }));

import { definedOnly, toDecimal } from "../lib/amounts";
import { buyingChanges, sellingChanges } from "../services/invoicing.service";
import { rateChanges } from "../services/exchangeRate.service";

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

  it("store exchange rates with 4 decimal places", () => {
    expect(rateChanges({ rateEur: "24.3456", note: "ČNB" })).toEqual({ rateEur: "24.3456", note: "ČNB" });
    expect(() => rateChanges({ rateUsd: "22.12345" })).toThrow("at most 4 decimal places");
  });
});
