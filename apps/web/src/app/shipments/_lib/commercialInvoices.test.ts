import { describe, expect, it } from "vitest";
import { invoiceLinesToSave, invoiceTotalsByCurrency } from "./commercialInvoices";

const line = (value: string, currency = "USD", invoiceNumber = "INV-1") => ({ invoiceNumber, value, currency });

describe("invoiceTotalsByCurrency", () => {
  it("reads a value with thousands separators as the amount it is, not 12.50", () => {
    expect(invoiceTotalsByCurrency([line("12,500.00"), line("2 500,50")])).toBe("15,000.50 USD");
  });

  it("adds up per currency and counts nothing for a value that is no amount", () => {
    expect(invoiceTotalsByCurrency([line("1000", "USD"), line("3,000.00", "EUR"), line("approx. 5000", "EUR")])).toBe("1,000.00 USD · 3,000.00 EUR");
  });
});

describe("invoiceLinesToSave", () => {
  it("writes each value as the API keeps amounts and leaves the empty rows out", () => {
    expect(invoiceLinesToSave([line("12,500.00"), { invoiceNumber: "", value: "", currency: "" }, line("", "", "INV-2")])).toEqual({
      lines: [line("12500"), line("", "", "INV-2")],
    });
  });

  it("refuses a value that is no amount, saying which", () => {
    expect(invoiceLinesToSave([line("1000"), line("2 x 40HC")])).toEqual({ error: '"2 x 40HC" is not a valid amount (max. 2 decimals)' });
  });
});
