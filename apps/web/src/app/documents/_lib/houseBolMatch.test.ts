import { describe, expect, it } from "vitest";
import type { ExtractedField } from "./extraction";
import { asksHouseBol, besideShipment, houseBolOf } from "./houseBolMatch";

const field = (column: string, extractedValue: string, over: Partial<ExtractedField> = {}): ExtractedField => ({
  column,
  extractedValue,
  existingValue: "",
  hasConflict: false,
  approved: true,
  ...over,
});

describe("houseBolOf", () => {
  it("is the House B/L of the review, trimmed", () => {
    expect(houseBolOf([field("Shipper", "ACME"), field("House BoL Number", " HBL-123 ")])).toBe("HBL-123");
  });
  it("is empty when none was read", () => {
    expect(houseBolOf([field("Shipper", "ACME")])).toBe("");
  });
});

describe("asksHouseBol", () => {
  it("asks for a House B/L of letters or digits", () => {
    expect(asksHouseBol("HBL-123", "")).toBe(true);
  });
  it("asks nothing for one without letters or digits", () => {
    expect(asksHouseBol(" / - ", "")).toBe(false);
  });
  it("asks nothing again for the one a new job was chosen for, written any way", () => {
    expect(asksHouseBol("hbl 123", "HBL-123")).toBe(false);
  });
  it("asks again once the House B/L was edited to another", () => {
    expect(asksHouseBol("HBL-124", "HBL-123")).toBe(true);
  });
});

describe("besideShipment", () => {
  it("sets each field beside the shipment's value and unticks one that differs", () => {
    const onFile: Record<string, string> = { Shipper: "ACME", Consignee: "Other s.r.o." };
    const out = besideShipment(
      [field("Shipper", "ACME"), field("Consignee", "Beta GmbH"), field("Vessel", "MSC ANNA", { approved: false })],
      (label) => onFile[label] ?? "",
    );
    expect(out).toEqual([
      field("Shipper", "ACME", { existingValue: "ACME" }),
      field("Consignee", "Beta GmbH", { existingValue: "Other s.r.o.", hasConflict: true, approved: false }),
      field("Vessel", "MSC ANNA", { approved: false }),
    ]);
  });
});
