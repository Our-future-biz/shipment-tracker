import { describe, expect, it } from "vitest";
import { consignmentPickupDecision, gateDecisions, parseShipmentChanges, pushesOwed, tripPlateDecision } from "../shipmentPush";

// F6: a person's change of a shipment reaches Trucking's job and the gate record - only the fields
// each keeps, only while it still holds the shipment's old value, only while it may still change.
describe("what a shipment write owes Trucking and the gate", () => {
  const before = { pickupDate: "2026-11-18", plateNumber: "3AB 1234", estimatedArrival: null, etaWarehouse: "2026-11-20", plannedDeliveryDate: "2026-11-19" };

  it("names each side's fields the write changed, from what to what", () => {
    const after = { ...before, pickupDate: "2026-11-19", plateNumber: "4CD 5678", estimatedArrival: "2026-11-25" };
    expect(pushesOwed(before, after, ["pickupDate", "plateNumber", "estimatedArrival"])).toEqual([
      { target: "trucking", changes: { pickupDate: { from: "2026-11-18", to: "2026-11-19" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } } },
      { target: "warehouse", changes: { estimatedArrival: { from: "", to: "2026-11-25" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } } },
    ]);
  });

  it("owes nothing for fields the other side does not keep, unchanged ones, or ones the write did not name", () => {
    const after = { ...before, plannedDeliveryDate: "2026-11-22", pickupDate: "2026-11-30" };
    expect(pushesOwed(before, after, ["plannedDeliveryDate", "plateNumber"])).toEqual([]);
    // Cleared counts as a change to "".
    expect(pushesOwed(before, { ...before, plateNumber: null }, ["plateNumber"]).map((p) => p.changes)).toEqual([
      { plateNumber: { from: "3AB 1234", to: "" } },
      { plateNumber: { from: "3AB 1234", to: "" } },
    ]);
  });

  it("owes the gate - not Trucking - a changed ETA Warehouse/HUB", () => {
    expect(pushesOwed(before, { ...before, etaWarehouse: "2026-11-21" }, ["etaWarehouse"])).toEqual([
      { target: "warehouse", changes: { etaWarehouse: { from: "2026-11-20", to: "2026-11-21" } } },
    ]);
    expect(parseShipmentChanges({ etaWarehouse: { from: "2026-11-20", to: "2026-11-21" } })).toEqual({ etaWarehouse: { from: "2026-11-20", to: "2026-11-21" } });
  });

  it("lets the gate record always take the ETA Warehouse/HUB, stamped or not, whatever it held: it is never edited at the gate", () => {
    const changes = { etaWarehouse: { from: "2026-11-20", to: "2026-11-21" } };
    const gate = { eta: "", plate: "", stamped: true, fromTrip: false };
    expect(gateDecisions({ ...gate, etaWarehouse: "" }, changes).etaWarehouse).toEqual({ kind: "apply", to: "2026-11-21" });
    expect(gateDecisions({ ...gate, etaWarehouse: "2026-11-19" }, changes).etaWarehouse).toEqual({ kind: "apply", to: "2026-11-21" });
    expect(gateDecisions({ ...gate, etaWarehouse: "2026-11-21" }, changes).etaWarehouse).toEqual({ kind: "same" });
  });

  it("reads back only well-formed changes from an outbox row", () => {
    expect(parseShipmentChanges({ pickupDate: { from: "a", to: "b" }, plateNumber: { from: 1, to: "x" }, other: { from: "", to: "" } })).toEqual({ pickupDate: { from: "a", to: "b" } });
    expect(parseShipmentChanges(null)).toEqual({});
  });
});

describe("Trucking takes a job's change", () => {
  const live = { pickupDate: "2026-11-18", pickedUpAt: null, gateInAt: null, cancelledAt: null };
  const moved = { from: "2026-11-18", to: "2026-11-19" };

  it("moves a consignment's pick-up date that still has the job's old one, before the pick-up", () => {
    expect(consignmentPickupDecision(live, moved)).toEqual({ kind: "apply", to: "2026-11-19" });
    expect(consignmentPickupDecision({ ...live, pickupDate: "2026-11-19" }, moved)).toEqual({ kind: "same" });
  });

  it("keeps its own date once picked up, cancelled, changed in Trucking, or when the job's was cleared", () => {
    expect(consignmentPickupDecision({ ...live, pickedUpAt: new Date() }, moved)).toMatchObject({ kind: "skip", reason: "the cargo is picked up already" });
    expect(consignmentPickupDecision({ ...live, gateInAt: new Date() }, moved)).toMatchObject({ kind: "skip" });
    expect(consignmentPickupDecision({ ...live, cancelledAt: new Date() }, moved)).toMatchObject({ kind: "skip", reason: "the consignment is cancelled" });
    expect(consignmentPickupDecision({ ...live, pickupDate: "2026-11-20" }, moved)).toEqual({ kind: "skip", reason: "its pick-up date was changed in Trucking (2026-11-20)" });
    expect(consignmentPickupDecision(live, { from: "2026-11-18", to: "" })).toMatchObject({ kind: "skip" });
  });

  it("sets the trip's tractor plate (as Trucking writes it) while it still has the job's old one, before the pick-up", () => {
    const trip = { tractorPlate: "3AB1234", cancelledAt: null };
    expect(tripPlateDecision(trip, live, { from: "3AB 1234", to: "4cd-5678" })).toEqual({ kind: "apply", to: "4CD5678" });
    expect(tripPlateDecision({ tractorPlate: null, cancelledAt: null }, live, { from: "", to: "4CD 5678" })).toEqual({ kind: "apply", to: "4CD5678" });
    expect(tripPlateDecision({ tractorPlate: "4CD5678", cancelledAt: null }, live, { from: "3AB 1234", to: "4CD 5678" })).toEqual({ kind: "same" });
    expect(tripPlateDecision({ tractorPlate: "9ZZ9999", cancelledAt: null }, live, { from: "3AB 1234", to: "4CD 5678" })).toMatchObject({ kind: "skip" });
    expect(tripPlateDecision(trip, { pickedUpAt: new Date(), gateInAt: null }, { from: "3AB 1234", to: "4CD 5678" })).toMatchObject({ kind: "skip" });
    expect(tripPlateDecision({ ...trip, cancelledAt: new Date() }, live, { from: "3AB 1234", to: "4CD 5678" })).toMatchObject({ kind: "skip" });
  });
});

describe("the gate record takes a shipment's change", () => {
  const record = { eta: "2026-11-24", plate: "3AB 1234", stamped: false, fromTrip: false };

  it("follows the ETA as Refresh from shipment does - also once stamped - unless the gate changed it", () => {
    const eta = { estimatedArrival: { from: "2026-11-24", to: "2026-11-25" } };
    expect(gateDecisions(record, eta)).toEqual({ eta: { kind: "apply", to: "2026-11-25" } });
    expect(gateDecisions({ ...record, stamped: true }, eta).eta).toEqual({ kind: "apply", to: "2026-11-25" });
    expect(gateDecisions({ ...record, eta: "2026-11-26" }, eta).eta).toMatchObject({ kind: "skip" });
    expect(gateDecisions({ ...record, eta: "2026-11-25" }, eta).eta).toEqual({ kind: "same" });
  });

  it("takes a plate only before any stamp, not on a record a Trucking trip announced, and not over the gate's own", () => {
    const plate = { plateNumber: { from: "3AB 1234", to: "4CD 5678" } };
    expect(gateDecisions(record, plate)).toEqual({ plate: { kind: "apply", to: "4CD 5678" } });
    expect(gateDecisions({ ...record, stamped: true }, plate).plate).toEqual({ kind: "skip", reason: "the gate stamped the vehicle already" });
    expect(gateDecisions({ ...record, fromTrip: true }, plate).plate).toMatchObject({ kind: "skip" });
    expect(gateDecisions({ ...record, plate: "1XY 0000" }, plate).plate).toMatchObject({ kind: "skip" });
    expect(gateDecisions(record, {})).toEqual({});
  });
});
