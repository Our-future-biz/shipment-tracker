import { describe, expect, it } from "vitest";
import type { ExtractedField } from "./extraction";
import { documentNumber, savedDocumentName, suggestedDocumentType } from "./savedDocument";

const field = (column: string, extractedValue: string): ExtractedField => ({
  column,
  extractedValue,
  existingValue: "",
  hasConflict: false,
  approved: true,
});

describe("documentNumber", () => {
  it("takes the House B/L first, then the Master B/L, then the Booking number", () => {
    const all = [field("Booking Number", "BK1"), field("Master BoL Number", "MBL1"), field("House BoL Number", "HBL1")];
    expect(documentNumber(all)).toEqual({ label: "House BoL Number", value: "HBL1" });
    expect(documentNumber(all.slice(0, 2)).value).toBe("MBL1");
    expect(documentNumber(all.slice(0, 1)).value).toBe("BK1");
  });

  it("skips a number that was read empty and finds none when nothing was read", () => {
    expect(documentNumber([field("House BoL Number", "  "), field("Booking Number", "BK1")]).value).toBe("BK1");
    expect(documentNumber([field("Shipper", "ACME")])).toEqual({ label: "", value: "" });
  });
});

describe("savedDocumentName", () => {
  it("names the file after the number and keeps the original extension", () => {
    expect(savedDocumentName([field("House BoL Number", "HLCU12345678")], "scan 01.PDF")).toBe("HLCU12345678.pdf");
  });

  it("replaces characters a file name can't hold", () => {
    expect(savedDocumentName([field("Master BoL Number", "MSC/123:45")], "bl.pdf")).toBe("MSC-123-45.pdf");
  });

  it("keeps the original name when no number was read", () => {
    expect(savedDocumentName([field("Shipper", "ACME")], "waybill.png")).toBe("waybill.png");
  });
});

describe("suggestedDocumentType", () => {
  it("offers a Bill of Lading for a B/L number and a Booking confirmation for a booking number alone", () => {
    expect(suggestedDocumentType([field("Master BoL Number", "M1"), field("Booking Number", "B1")], "x.pdf")).toBe("Bill of Lading");
    expect(suggestedDocumentType([field("Booking Number", "B1")], "x.pdf")).toBe("Booking confirmation");
  });

  it("without a number, guesses from the file name, else a Bill of Lading", () => {
    expect(suggestedDocumentType([], "packing list.pdf")).toBe("Packing list");
    expect(suggestedDocumentType([], "scan.pdf")).toBe("Bill of Lading");
  });
});
