import { describe, expect, it } from "vitest";
import {
  CUSTOMS_TAB_GROUPS,
  DOCUMENT_TYPES,
  documentGroupOf,
  isReviewedDocumentType,
  supplierInvoiceType,
  SUPPLIER_INVOICE_TYPES,
} from "./documentTypes";

describe("suppliers' invoices", () => {
  it("are document types listed in their own table", () => {
    for (const type of SUPPLIER_INVOICE_TYPES) {
      expect(DOCUMENT_TYPES).toContain(type);
      expect(documentGroupOf(type).title).toBe("Suppliers Invoice(s)");
    }
  });

  it("are never reviewed by customs and not shown on the Customs tab", () => {
    expect(SUPPLIER_INVOICE_TYPES.some(isReviewedDocumentType)).toBe(false);
    expect(CUSTOMS_TAB_GROUPS.map((g) => g.title)).toEqual([
      "Commercial Documents",
      "Shipping Documents",
      "Customs Documents",
    ]);
  });

  it("take their type from the cost category, else none", () => {
    expect(supplierInvoiceType("ocean_freight")).toBe("Seafreight Charges");
    expect(supplierInvoiceType("air_freight")).toBe("Airfreight Charges");
    expect(supplierInvoiceType("rail_freight")).toBe("Railfreight Charges");
    expect(supplierInvoiceType("pickup")).toBe("Pre-carriage Charges");
    expect(supplierInvoiceType("delivery")).toBe("On-carriage Charges");
    expect(supplierInvoiceType("insurance")).toBe("Insurance Charges");
    expect(supplierInvoiceType("customs")).toBe("");
  });

  it("leave the other tables as they were", () => {
    expect(documentGroupOf("Invoice").title).toBe("Commercial Documents");
    expect(documentGroupOf("Insurance").title).toBe("Shipping Documents");
    expect(documentGroupOf("Other").title).toBe("Shipping Documents");
    expect(isReviewedDocumentType("Invoice")).toBe(true);
  });
});
