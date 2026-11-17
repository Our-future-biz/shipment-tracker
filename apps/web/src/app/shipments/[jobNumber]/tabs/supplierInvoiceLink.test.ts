import { describe, expect, it } from "vitest";
import { apInvoiceHref, supplierInvoiceOptions } from "./supplierInvoiceLink";

const line = (supplierInvoiceId: string | null, vendor = "Maersk", invoiceNumber = "FA-1", realCurrency = "EUR") => ({
  supplierInvoiceId,
  vendor,
  invoiceNumber,
  realCurrency,
});

describe("the Accounts Payable link", () => {
  it("opens the one invoice", () => {
    expect(apInvoiceHref("1f0c2a9e-0000-4000-8000-000000000001")).toBe("/accounts-payable?invoice=1f0c2a9e-0000-4000-8000-000000000001");
  });
});

describe("the supplier invoices of a shipment", () => {
  it("names each invoice once, by vendor and number, in the order of its lines", () => {
    expect(supplierInvoiceOptions([line("a"), line(null, "DHL", ""), line("b", "DHL", "77", "CZK"), line("a")])).toEqual([
      { value: "a", label: "Maersk · FA-1", vendor: "Maersk", invoiceNumber: "FA-1", currency: "EUR" },
      { value: "b", label: "DHL · 77", vendor: "DHL", invoiceNumber: "77", currency: "CZK" },
    ]);
  });

  it("is labelled by what is known of it", () => {
    expect(supplierInvoiceOptions([line("a", " ", "FA-2")])[0]!.label).toBe("FA-2");
    expect(supplierInvoiceOptions([line("a", "", "")])[0]!.label).toBe("Supplier invoice");
  });
});
