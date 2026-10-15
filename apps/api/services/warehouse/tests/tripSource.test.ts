import { describe, expect, it } from "vitest";
import {
  clearTripLeg,
  clearTripPickupRows,
  fillTripLeg,
  fromTrip,
  isTripSource,
  mergeUserPickupRows,
  protectTripLegs,
  setTripPickupRow,
  tripLabel,
  tripSlotWindow,
} from "../services/tripSource";
import { normalizeLegs } from "../services/gateMovement.service";
import { parsePickupRows, pickupRowsFromInput } from "../services/pickupPin";
import { gateStampedEvents } from "../services/gateEvents";
import { DEFAULT_DOCKS } from "../services/settingsRules";

// The "From trip LCZ…" marker (pure helpers) and the events a stamp owes.

const src = (tripRef: string) => ({ kind: "trucking" as const, tripRef });
const truck = { company: "Rapid", plate: "1AB 2345", driver: "Jan", phone: "+420", gateTime: "2026-10-15T08:00:00.000Z" };

describe("trip marker", () => {
  it("recognises only a well-formed marker", () => {
    expect(isTripSource(src("LCZ1"))).toBe(true);
    expect(isTripSource({ kind: "manual", tripRef: "LCZ1" })).toBe(false);
    expect(isTripSource({ kind: "trucking", tripRef: " " })).toBe(false);
    expect(isTripSource(null)).toBe(false);
    expect(fromTrip({ source: src("LCZ1") }, "LCZ1")).toBe(true);
    expect(fromTrip({ source: src("LCZ1") }, "LCZ2")).toBe(false);
    expect(tripLabel(src("LCZ26-0001"))).toBe("From trip LCZ26-0001");
  });
});

describe("transport legs", () => {
  it("fills one leg with the marker and leaves the others", () => {
    const legs = fillTripLeg(normalizeLegs([]), "IN", "LCZ1", truck);
    expect(legs.find((l) => l.leg === "IN")).toEqual({ leg: "IN", ...truck, source: src("LCZ1") });
    expect(legs.find((l) => l.leg === "OUT")).toEqual({ leg: "OUT", company: "", plate: "", driver: "", phone: "", gateTime: "" });
  });

  it("keeps a trip's leg read-only on a save and drops a forged marker", () => {
    const stored = fillTripLeg(normalizeLegs([]), "IN", "LCZ1", truck);
    const incoming = stored.map((l) => (l.leg === "IN" ? { ...l, company: "Changed", source: null } : { ...l, company: "Own", source: src("FAKE") }));
    const out = protectTripLegs(stored, incoming);
    expect(out.find((l) => l.leg === "IN")).toEqual(stored.find((l) => l.leg === "IN"));
    expect(out.find((l) => l.leg === "OUT")).toEqual({ leg: "OUT", company: "Own", plate: "", driver: "", phone: "", gateTime: "" });
  });

  it("clears a leg only for the trip that filled it", () => {
    const legs = fillTripLeg(normalizeLegs([]), "IN", "LCZ1", truck);
    expect(clearTripLeg(legs, "IN", "LCZ2")).toEqual(legs);
    expect(clearTripLeg(legs, "IN", "LCZ1").find((l) => l.leg === "IN")).toEqual({ leg: "IN", company: "", plate: "", driver: "", phone: "", gateTime: "" });
    // A leg typed by hand is never cleared by a trip.
    const typed = normalizeLegs([{ leg: "OUT", ...truck }]);
    expect(clearTripLeg(typed, "OUT", "LCZ1")).toEqual(typed);
  });
});

describe("pick-up rows", () => {
  const tripRow = { haulier: "Rapid", licensePlate: "1AB 2345", driver: "Jan", source: src("LCZ1") };
  const typed = { haulier: "Typed", licensePlate: "", driver: "" };

  it("one row per trip, trip rows first; a repeat replaces it", () => {
    const once = setTripPickupRow([typed], "LCZ1", { haulier: "Rapid", licensePlate: "1AB 2345", driver: "Jan" });
    expect(once).toEqual([tripRow, typed]);
    const again = setTripPickupRow(once, "LCZ1", { haulier: "Rapid", licensePlate: "2CD 3456", driver: "Jan" });
    expect(again).toEqual([{ ...tripRow, licensePlate: "2CD 3456" }, typed]);
    const second = setTripPickupRow(again, "LCZ2", { haulier: "Other", licensePlate: "", driver: "" });
    expect(second.map((r) => r.source?.tripRef ?? "")).toEqual(["LCZ1", "LCZ2", ""]);
    expect(clearTripPickupRows(second, "LCZ1").map((r) => r.source?.tripRef ?? "")).toEqual(["LCZ2", ""]);
  });

  it("a save from Shipments keeps the stored trip rows and never takes one from the client", () => {
    const merged = mergeUserPickupRows([tripRow, typed], [{ ...tripRow, haulier: "Edited" }, { haulier: "New", licensePlate: "", driver: "" }]);
    expect(merged).toEqual([tripRow, { haulier: "New", licensePlate: "", driver: "" }]);
    // The input parser leaves the echoed trip row out as well.
    expect(pickupRowsFromInput({ rows: JSON.stringify([tripRow, typed]) })).toEqual([typed]);
  });

  it("reads the marker back from the stored JSON, and nothing malformed", () => {
    expect(parsePickupRows(JSON.stringify([tripRow, { ...typed, source: { kind: "x", tripRef: "LCZ1" } }]))).toEqual([tripRow, typed]);
  });
});

describe("dock slot for a trip", () => {
  it("asks for the Prague time on a working day within the dock hours", () => {
    expect(tripSlotWindow(new Date("2026-10-15T08:00:00.000Z"), DEFAULT_DOCKS)).toEqual({ date: "2026-10-15", time: "10:00", durationMin: 60 });
    // Winter time: 08:00 UTC is 09:00 in Prague.
    expect(tripSlotWindow(new Date("2026-12-01T08:00:00.000Z"), DEFAULT_DOCKS)).toEqual({ date: "2026-12-01", time: "09:00", durationMin: 60 });
  });

  it("refuses a day off and a time outside the hours (the slot must end by closing)", () => {
    expect(tripSlotWindow(new Date("2026-10-17T08:00:00.000Z"), DEFAULT_DOCKS)).toMatchObject({ reason: expect.stringContaining("do not work") });
    expect(tripSlotWindow(new Date("2026-10-15T03:30:00.000Z"), DEFAULT_DOCKS)).toMatchObject({ reason: expect.stringContaining("outside") });
    // 18:30 + 60 min ends after 19:00.
    expect(tripSlotWindow(new Date("2026-10-15T16:30:00.000Z"), DEFAULT_DOCKS)).toMatchObject({ reason: expect.stringContaining("outside") });
    expect(tripSlotWindow(new Date("2026-10-15T16:00:00.000Z"), DEFAULT_DOCKS)).toEqual({ date: "2026-10-15", time: "18:00", durationMin: 60 });
  });
});

describe("events a stamp owes", () => {
  const base = { companyId: "c", movementId: "m", positionId: "p", wczRef: "WCZ1", shipmentId: "s", userId: "u", at: new Date("2026-10-15T08:00:00.000Z") };

  it("gateIn / gateOut for the columns this change stamped", () => {
    expect(gateStampedEvents({ ...base, stampKind: "expDraft", stamped: { gateIn: true } })).toEqual([
      { companyId: "c", shipmentId: "s", positionId: "p", wczRef: "WCZ1", kind: "gateIn", stampKind: "expDraft", at: "2026-10-15T08:00:00.000Z", userId: "u" },
    ]);
    expect(gateStampedEvents({ ...base, stampKind: "impRelease", stamped: { gateOut: true } }).map((e) => e.kind)).toEqual(["gateOut"]);
    expect(gateStampedEvents({ ...base, stampKind: "expReceipt", stamped: {} })).toEqual([]);
  });

  it("voided names the column, and nothing without a position", () => {
    expect(gateStampedEvents({ ...base, stampKind: "impRelease", voided: { gateOut: true } })).toEqual([expect.objectContaining({ kind: "voided", stampKind: "gateOut" })]);
    expect(gateStampedEvents({ ...base, positionId: null, stampKind: "gateIn", stamped: { gateIn: true } })).toEqual([]);
  });
});
