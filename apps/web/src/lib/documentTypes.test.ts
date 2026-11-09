import { describe, expect, it } from "vitest";
import {
  CUSTOMS_TAB_GROUPS,
  customsTabGroups,
  DOCUMENT_TYPES,
  documentGroupOf,
  documentTypeLabel,
  guessDocumentType,
  receivedDocumentsByType,
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
      "Safety Paperwork",
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
  });

  it("show on the Customs tab for dangerous goods, or once such a file is on the shipment", () => {
    const titles = (dangerous: boolean, types: string[]) => customsTabGroups(dangerous, types).map((g) => g.title);
    expect(titles(false, [])).not.toContain("Safety Paperwork");
    expect(titles(false, ["Commercial Invoice"])).not.toContain("Safety Paperwork");
    expect(titles(true, [])).toContain("Safety Paperwork");
    expect(titles(false, [SAFETY_PAPERWORK_TYPES[0]!])).toContain("Safety Paperwork");
    expect(titles(true, [])).not.toContain("Suppliers Invoice(s)");
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

describe("the documents that stand for each required type", () => {
  const file = (documentType: string, customsStatus: string, fileName = "a.pdf") => ({ documentType, customsStatus, fileName });

  it("do not include one customs declined, so the type is missing again", () => {
    expect(receivedDocumentsByType([file("Invoice", "declined")]).has("Invoice")).toBe(false);
  });

  it("count a file waiting for review or approved", () => {
    expect(receivedDocumentsByType([file("Invoice", ""), file("Packing list", "approved")]).size).toBe(2);
  });

  it("count the replacement of a declined file, whichever came first", () => {
    const replaced = [file("Invoice", "declined", "old.pdf"), file("Invoice", "", "new.pdf")];
    expect(receivedDocumentsByType(replaced).get("Invoice")?.fileName).toBe("new.pdf");
    expect(receivedDocumentsByType([...replaced].reverse()).get("Invoice")?.fileName).toBe("new.pdf");
  });

  it("leave out a file without a type", () => {
    expect(receivedDocumentsByType([file("", "")]).size).toBe(0);
  });
});
