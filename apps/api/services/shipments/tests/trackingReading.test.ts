import { describe, expect, it } from "vitest";
import { containersIn, documentEffect, readingExternalId, readingPreview } from "../lib/trackingReading";
import type { ShipmentRecord } from "../schemas/shipment.schema";

const shipment = {
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  pol: "Shanghai",
  pod: "Hamburg",
  estimatedDeparture: "2026-10-01",
  estimatedArrival: "2026-11-10",
  vessel: "",
  voyage: "",
  actualDeparture: null,
  actualArrival: null,
  actualDeliveryDate: null,
} as unknown as ShipmentRecord;
const TODAY = "2026-11-06";
const preview = (extracted: Record<string, string>, s = shipment, containers: string[] = [], kept: string[] = []) => readingPreview(extracted, s, containers, new Set(kept), TODAY);

describe("readingPreview", () => {
  it("lists the facts in the order they happen, with what keeping them does", () => {
    const { facts } = preview({ Discharged: "2026-11-05", ATA: "2026-11-04", ATD: "2026-10-02", Vessel: "EVER GIVEN", Voyage: "123E" });
    expect(facts.map((f) => [f.kind, f.effect, f.sets])).toEqual([
      ["departed", "propose", "ATD"],
      ["arrived", "propose", "ATA"],
      ["discharged", "none", ""],
    ]);
    expect(facts[0]).toMatchObject({ place: "Shanghai", vessel: "EVER GIVEN 123E" });
    expect(facts[1]).toMatchObject({ place: "Hamburg", vessel: "" });
  });

  it("says what a train is doing", () => {
    const { facts } = preview({ ATA: "2026-11-04" }, { ...shipment, freightMode: "Rail Freight" });
    expect(facts[0]!.label).toBe("Arrived at the terminal");
  });

  it("sets a new ETA itself and drops one that moved nothing", () => {
    expect(preview({ "New ETA": "2026-11-20" }).facts[0]).toMatchObject({ kind: "eta_changed", effect: "apply", sets: "ETA", note: "From a document" });
    expect(preview({ "New ETA": "2026-11-10" }).facts).toEqual([]);
  });

  it("proposes no date the shipment already has", () => {
    expect(preview({ ATA: "2026-11-04" }, { ...shipment, actualArrival: "2026-11-04" }).facts[0]).toMatchObject({ effect: "none", sets: "" });
  });

  it("keeps a hold, a free day and an availability as dated today", () => {
    const { facts } = preview({ "Customs Hold": "X-ray", "Available From": "2026-11-08", "Last Free Day": "2026-11-12" });
    expect(facts).toEqual([
      expect.objectContaining({ kind: "hold", occurredOn: TODAY, note: "X-ray" }),
      expect.objectContaining({ kind: "note", occurredOn: TODAY, note: "Available from 08.11.2026" }),
      expect.objectContaining({ kind: "note", occurredOn: TODAY, note: "Last free day 12.11.2026" }),
    ]);
  });

  it("ignores what is not a day", () => {
    expect(preview({ ATA: "soon", ATD: "2026-02-31" }).facts).toEqual([]);
  });

  it("says what can't be kept and what is kept already", () => {
    const { facts } = preview({ ATA: "2027-01-01", ATD: "2026-10-02" }, shipment, [], [readingExternalId({ kind: "departed", occurredOn: "2026-10-02", note: "" })]);
    expect(facts[0]).toMatchObject({ kind: "departed", alreadyKept: true, refusal: "" });
    expect(facts[1]).toMatchObject({ kind: "arrived", alreadyKept: false });
    expect(facts[1]!.refusal).toContain("future");
  });

  it("warns when none of the containers named is on the shipment", () => {
    expect(preview({ "Container Numbers": "MSKU 123456-7" }, shipment, ["CSQU3054383"])).toMatchObject({ containersFound: ["MSKU1234567"], otherShipment: true });
    expect(preview({ "Container Numbers": "csqu3054383, MSKU1234567" }, shipment, ["CSQU3054383"]).otherShipment).toBe(false);
    expect(preview({ "Container Numbers": "MSKU1234567" }).otherShipment).toBe(false);
    expect(preview({}, shipment, ["CSQU3054383"]).otherShipment).toBe(false);
  });
});

describe("the vessel a notice names", () => {
  const held = { ...shipment, vessel: "EVER GIVEN", voyage: "123E" } as ShipmentRecord;
  it("is a change while nothing has sailed", () => {
    expect(preview({ Vessel: "EVER TEST" }, held).vesselChange).toEqual({ vessel: "EVER TEST", voyage: "123E" });
    expect(preview({ Voyage: "9W" }, held).vesselChange).toEqual({ vessel: "EVER GIVEN", voyage: "9W" });
  });
  it("is no change when it is the same, or gone", () => {
    expect(preview({ Vessel: "ever given", Voyage: "123e" }, held).vesselChange).toBeNull();
    expect(preview({}, held).vesselChange).toBeNull();
    expect(preview({ Vessel: "EVER TEST" }, { ...held, actualDeparture: "2026-10-02" } as ShipmentRecord).vesselChange).toBeNull();
  });
});

describe("containersIn", () => {
  it("reads numbers however they are written", () => {
    expect(containersIn("MSKU 123456-7, msmu2727277 and MSKU1234567")).toEqual(["MSKU1234567", "MSMU2727277"]);
    expect(containersIn(undefined)).toEqual([]);
  });
});

describe("documentEffect", () => {
  it("never sets the customs status", () => {
    expect(documentEffect("customs_released", shipment, TODAY).mode).toBe("none");
  });
});
