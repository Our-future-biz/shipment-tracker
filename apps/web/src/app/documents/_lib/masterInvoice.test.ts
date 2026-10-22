import { describe, expect, it } from "vitest";
import { missingWm, splitLines, type MasterInvoiceRow } from "./masterInvoice";

const rows: MasterInvoiceRow[] = [
  { shipmentId: "a", jobNumber: "CZ1", freightTon: 2.5 },
  { shipmentId: "b", jobNumber: "CZ2", freightTon: 0 },
  { shipmentId: "c", jobNumber: "CZ3", freightTon: 1 },
];

describe("splitLines", () => {
  it("takes only the ticked shipments, weighted by their W/M", () => {
    expect(splitLines(rows, new Set(["a", "c"]), "wm")).toEqual([
      { shipmentId: "a", weight: 2.5 },
      { shipmentId: "c", weight: 1 },
    ]);
  });

  it("per shipment, weighs every ticked shipment the same, W/M or not", () => {
    expect(splitLines(rows, new Set(["a", "b"]), "shipment")).toEqual([
      { shipmentId: "a", weight: 1 },
      { shipmentId: "b", weight: 1 },
    ]);
  });
});

describe("missingWm", () => {
  it("names a ticked shipment without W/M only for a W/M split", () => {
    expect(missingWm(rows, new Set(["a", "b"]), "wm").map((r) => r.jobNumber)).toEqual(["CZ2"]);
    expect(missingWm(rows, new Set(["a", "b"]), "shipment")).toEqual([]);
  });

  it("ignores an unticked shipment without W/M", () => {
    expect(missingWm(rows, new Set(["a", "c"]), "wm")).toEqual([]);
  });
});
