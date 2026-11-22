import { describe, expect, it } from "vitest";
import type { ExtractedField } from "./extraction";
import { asksHouseBol, asRemeasurement, besideShipment, blRemeasuredLine, houseBolOf, sameHouseBol, withoutBlFigures } from "./houseBolMatch";

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

describe("the House B/L of the shipment written into (owner's answer 22 Nov)", () => {
  it("is the same B/L written any way, never an empty one", () => {
    expect(sameHouseBol("HBL-123", "hbl 123")).toBe(true);
    expect(sameHouseBol("HBL-123", "HBL-124")).toBe(false);
    expect(sameHouseBol("", "")).toBe(false);
  });

  it("makes the B/L's Colli, weight and volume one remeasured line with the same totals", () => {
    expect(blRemeasuredLine({ PCS: "30", "Total Weight In Tons": "1.5", "Total Volume In CBM": "3.5" })).toEqual({
      pieces: "30",
      lengthCm: "",
      widthCm: "",
      heightCm: "",
      weightPerPcKg: "50",
      volumePerPcM3: "0.1166667",
    });
    const odd = blRemeasuredLine({ PCS: "7", "Total Weight In Tons": "1.234", "Total Volume In CBM": "2" })!;
    expect(Math.round(7 * Number(odd.weightPerPcKg) * 10) / 10).toBe(1234);
    expect(Math.round(7 * Number(odd.volumePerPcM3) * 1000) / 1000).toBe(2);
  });

  it("writes no line without whole colli, and leaves out a figure the B/L lacks", () => {
    expect(blRemeasuredLine({ "Total Weight In Tons": "1.5" })).toBeNull();
    expect(blRemeasuredLine({ PCS: "2.5" })).toBeNull();
    expect(blRemeasuredLine({ PCS: "4" })).toEqual({ pieces: "4", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" });
  });

  it("keeps the figures off the shipment and shows them as new to the Warehouse", () => {
    expect(withoutBlFigures({ PCS: "30", "Total Weight In Tons": "1.5", "Total Volume In CBM": "3.5", Vessel: "MSC" })).toEqual({ Vessel: "MSC" });
    const [pcs, vessel] = asRemeasurement([field("PCS", "30", { existingValue: "20", hasConflict: true, approved: false }), field("Vessel", "MSC", { existingValue: "X", hasConflict: true, approved: false })]);
    expect(pcs).toEqual(field("PCS", "30"));
    expect(vessel!.approved).toBe(false);
  });
});
