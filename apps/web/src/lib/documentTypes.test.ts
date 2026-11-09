import { describe, expect, it } from "vitest";
import {
  CUSTOMS_TAB_GROUPS,
  DOCUMENT_TYPES,
  documentGroupOf,
  documentTypeLabel,
  guessDocumentType,
  requiredDocumentTypes,
  SAFETY_PAPERWORK_TYPES,
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

describe("document type names on screen", () => {
  it("show Invoice as Commercial Invoice and keep every other type as stored", () => {
    expect(documentTypeLabel("Invoice")).toBe("Commercial Invoice");
    expect(documentTypeLabel("Packing list")).toBe("Packing list");
    expect(documentTypeLabel("")).toBe("");
  });
});

describe("the safety paperwork of dangerous goods", () => {
  it("are options, listed under their own heading, and not reviewed by customs", () => {
    for (const type of SAFETY_PAPERWORK_TYPES) {
      expect(DOCUMENT_TYPES).toContain(type);
      expect(documentGroupOf(type).title).toBe("Safety Paperwork");
      expect(isReviewedDocumentType(type)).toBe(false);
    }
    expect(CUSTOMS_TAB_GROUPS.map((g) => g.title)).not.toContain("Safety Paperwork");
  });

  it("are required only for dangerous goods", () => {
    expect(requiredDocumentTypes(false)).toHaveLength(6);
    expect(requiredDocumentTypes(true)).toEqual([...requiredDocumentTypes(false), "MSDS", "Dangerous Goods Declaration"]);
  });

  it("are recognised from the file name", () => {
    expect(guessDocumentType("MSDS paint.pdf")).toBe("MSDS");
    expect(guessDocumentType("SDS-2673.pdf")).toBe("MSDS");
    expect(guessDocumentType("Safety Data Sheet.pdf")).toBe("MSDS");
    expect(guessDocumentType("DGD_CZLCL41.pdf")).toBe("Dangerous Goods Declaration");
    expect(guessDocumentType("Dangerous Goods Declaration.pdf")).toBe("Dangerous Goods Declaration");
  });
});
