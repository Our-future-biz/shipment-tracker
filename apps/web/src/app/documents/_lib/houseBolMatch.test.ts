import { describe, expect, it } from "vitest";
import type { ExtractedField } from "./extraction";
import {
  afterHouseBolEdit,
  asBlDetails,
  asksHouseBol,
  besideShipment,
  blDetailsOf,
  blFigures,
  blFiguresOver,
  houseBolOf,
  houseBolOnWrite,
  matchStillShown,
  reviewedFields,
  sameHouseBol,
  shipmentWrittenTitle,
  withoutBlFigures,
} from "./houseBolMatch";

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

// The shipment X that has House B/L HBL-A, with 20 colli and 1.2 t; the read gives 30 colli and 1.5 t.
const X = { id: "x", jobNumber: "CZ26-0001", houseBolNumber: "HBL-A" };
const onX: Record<string, string> = { "House BoL Number": "HBL-A", PCS: "20", "Total Weight In Tons": "1.2", Shipper: "ACME" };
const newJobReview = (houseBol: string, over: Record<string, Partial<ExtractedField>> = {}) => [
  field("House BoL Number", houseBol, over["House BoL Number"]),
  field("PCS", "30", over.PCS),
  field("Total Weight In Tons", "1.5", over["Total Weight In Tons"]),
  field("Shipper", "ACME", over.Shipper),
];
const withHouseBol = (fields: ExtractedField[], houseBol: string) => fields.map((f) => (f.column === "House BoL Number" ? { ...f, extractedValue: houseBol } : f));
const byColumn = (fields: ExtractedField[]) => Object.fromEntries(fields.map((f) => [f.column, f]));

describe("the House B/L on a shipment already, as the review has it now (review of system-23)", () => {
  it("shows the card only while the review holds the House B/L it was found for", () => {
    const match = { houseBol: "HBL-A", shipment: X };
    expect(matchStillShown(match, newJobReview("hbl a"))).toBe(true);
    expect(matchStillShown(match, newJobReview("HBL-C"))).toBe(false);
    expect(matchStillShown(null, newJobReview("HBL-A"))).toBe(false);
  });

  it("asks a House B/L edited after Create new job again", () => {
    // The card was for HBL-A; the review now holds HBL-C: no card, so HBL-C was never answered and is asked on Write.
    const match = { houseBol: "HBL-A", shipment: X };
    const review = newJobReview("HBL-C");
    expect(matchStillShown(match, review)).toBe(false);
    expect(asksHouseBol(houseBolOf(review), match.houseBol)).toBe(true);
    expect(asksHouseBol(houseBolOf(newJobReview("HBL-A")), match.houseBol)).toBe(false);
  });

  it("holds Write when the lookup failed, creates when none has it, shows the shipment that has it", () => {
    expect(houseBolOnWrite("HBL-C", { error: "Service unavailable" })).toEqual({ kind: "hold", houseBol: "HBL-C", error: "Service unavailable" });
    expect(houseBolOnWrite("HBL-C", { shipment: null })).toEqual({ kind: "create" });
    expect(houseBolOnWrite("HBL-A", { shipment: X })).toEqual({ kind: "match", match: { houseBol: "HBL-A", shipment: X } });
  });
});

describe("the House B/L of the shipment written into (owner's answer 22 Nov)", () => {
  it("is the same B/L written any way, never an empty one", () => {
    expect(sameHouseBol("HBL-123", "hbl 123")).toBe(true);
    expect(sameHouseBol("HBL-123", "HBL-124")).toBe(false);
    expect(sameHouseBol("", "")).toBe(false);
  });

  it("takes the B/L's Colli, weight (tons as kg) and volume as its Bill Of Lading Details", () => {
    expect(blFigures({ PCS: "30", "Total Weight In Tons": "1.5", "Total Volume In CBM": "3.5" })).toEqual({ colli: 30, weightKg: 1500, volumeCbm: 3.5 });
    expect(blFigures({ PCS: "30 PLTS", "Total Weight In Tons": "1,5" })).toEqual({ colli: 30, weightKg: 1500, volumeCbm: 0 });
  });

  it("gives none when the B/L names no Colli, weight or volume", () => {
    expect(blFigures({ Vessel: "MSC" })).toBeNull();
  });

  it("keeps the figures off the shipment and shows them as new to the Warehouse, ticked as they are", () => {
    expect(withoutBlFigures({ PCS: "30", "Total Weight In Tons": "1.5", "Total Volume In CBM": "3.5", Vessel: "MSC" })).toEqual({ Vessel: "MSC" });
    const [pcs, weight, vessel] = asBlDetails([
      field("PCS", "30", { existingValue: "20", hasConflict: true }),
      field("Total Weight In Tons", "1.5", { existingValue: "1.2", hasConflict: true, approved: false }),
      field("Vessel", "MSC", { existingValue: "X", hasConflict: true, approved: false }),
    ]);
    expect(pcs).toEqual(field("PCS", "30"));
    expect(weight).toEqual(field("Total Weight In Tons", "1.5", { approved: false }));
    expect(vessel).toEqual(field("Vessel", "MSC", { existingValue: "X", hasConflict: true, approved: false }));
  });

  it("works the treatment out from the House B/L the review holds now", () => {
    const fields = [field("House BoL Number", "HBL-A"), field("PCS", "30", { existingValue: "20", hasConflict: true })];
    expect(byColumn(reviewedFields(fields, "HBL-A")).PCS).toEqual(field("PCS", "30"));
    expect(reviewedFields(withHouseBol(fields, "HBL-C"), "HBL-A")).toEqual(withHouseBol(fields, "HBL-C"));
    expect(reviewedFields(fields, undefined)).toEqual(fields);
  });
});

describe("Approve, then the House B/L edited (review of system-23)", () => {
  // Approve on the card for HBL-A: the review set beside X, its own House B/L.
  const approve = (review: ExtractedField[]) => besideShipment(review, (label) => onX[label] ?? "", sameHouseBol(X.houseBolNumber, houseBolOf(review)));

  it("keeps the ticks the user gave the B/L's figures: they go to X's Warehouse, not against its values", () => {
    const state = approve(newJobReview("HBL-A", { PCS: { approved: false } }));
    const shown = byColumn(reviewedFields(state, X.houseBolNumber));
    expect(shown.PCS).toEqual(field("PCS", "30", { approved: false }));
    expect(shown["Total Weight In Tons"]).toEqual(field("Total Weight In Tons", "1.5"));
  });

  it("sets them against X's values again, differing ones unticked, once the House B/L is edited to another", () => {
    const state = approve(newJobReview("HBL-A"));
    const edited = afterHouseBolEdit(state, withHouseBol(state, "HBL-C"), X.houseBolNumber);
    const shown = byColumn(reviewedFields(edited, X.houseBolNumber));
    expect(shown.PCS).toEqual(field("PCS", "30", { existingValue: "20", hasConflict: true, approved: false }));
    expect(shown["Total Weight In Tons"]).toEqual(field("Total Weight In Tons", "1.5", { existingValue: "1.2", hasConflict: true, approved: false }));
    expect(shown.Shipper).toEqual(field("Shipper", "ACME", { existingValue: "ACME" }));
    // Written so, X keeps its 20 colli and 1.2 t: the B/L's figures are not among the fields ticked.
    expect(Object.values(shown).filter((f) => f.approved).map((f) => f.column)).toEqual(["House BoL Number", "Shipper"]);
  });

  it("keeps the tick of a figure the user made X's, and every tick when the House B/L stays X's", () => {
    const state = approve(newJobReview("HBL-A"));
    const twenty = state.map((f) => (f.column === "PCS" ? { ...f, extractedValue: "20" } : f));
    expect(byColumn(afterHouseBolEdit(twenty, withHouseBol(twenty, "HBL-C"), X.houseBolNumber)).PCS).toEqual(field("PCS", "20", { existingValue: "20" }));
    expect(afterHouseBolEdit(state, withHouseBol(state, "hbl a"), X.houseBolNumber)).toEqual(withHouseBol(state, "hbl a"));
  });
});

describe("which shipment gets the read's Bill Of Lading Details (review of system-23)", () => {
  const read = { "House BoL Number": "HBL-A", PCS: "30" };
  it("its own House B/L: the details, and the figures stay off the shipment", () => {
    expect(blDetailsOf("hbl a", "HBL-A", { PCS: "30" })).toEqual({ details: true, offShipment: true });
  });
  it("a new job made from the read: the details beside the figures written onto it", () => {
    expect(blDetailsOf(undefined, "HBL-A", read)).toEqual({ details: true, offShipment: false });
  });
  it("a shipment without a House B/L, given it by the read: the details beside the figures written onto it", () => {
    expect(blDetailsOf("", "HBL-A", read)).toEqual({ details: true, offShipment: false });
  });
  it("none for a shipment with another House B/L, or one the read gives no House B/L", () => {
    expect(blDetailsOf("HBL-B", "HBL-A", read)).toEqual({ details: false, offShipment: false });
    expect(blDetailsOf("", "HBL-A", { PCS: "30" })).toEqual({ details: false, offShipment: false });
    expect(blDetailsOf(undefined, "", { PCS: "30" })).toEqual({ details: false, offShipment: false });
  });
});

describe("the B/L's figures over the ones saved (review of system-23)", () => {
  const saved = { houseBol: "HBL-A", colli: 30, weightKg: 1500, volumeCbm: 3.5 };
  it("keeps the saved figures the read does not give, for the same House B/L", () => {
    expect(blFiguresOver({ PCS: "40" }, saved, "hbl a")).toEqual({ colli: 40, weightKg: 1500, volumeCbm: 3.5 });
  });
  it("starts afresh for another House B/L, or none saved", () => {
    expect(blFiguresOver({ PCS: "40" }, saved, "HBL-B")).toEqual({ colli: 40, weightKg: 0, volumeCbm: 0 });
    expect(blFiguresOver({ PCS: "40" }, null, "HBL-A")).toEqual({ colli: 40, weightKg: 0, volumeCbm: 0 });
  });
  it("gives none when the read gives no Colli, weight or volume", () => {
    expect(blFiguresOver({ Vessel: "MSC" }, saved, "HBL-A")).toBeNull();
  });
});

describe("the success line of a read written into a shipment (review of system-23)", () => {
  it("counts the fields written onto the shipment only", () => {
    expect(shipmentWrittenTitle(3, "CZ26-0001", true)).toBe("3 fields written to CZ26-0001");
    expect(shipmentWrittenTitle(1, "CZ26-0001", false)).toBe("1 field written to CZ26-0001");
  });
  it("names the Warehouse when only the B/L's figures were written, there", () => {
    expect(shipmentWrittenTitle(0, "CZ26-0001", true)).toBe("Bill Of Lading Details written to CZ26-0001's Warehouse tab");
    expect(shipmentWrittenTitle(0, "CZ26-0001", false)).toBe("Nothing written to CZ26-0001");
  });
});
