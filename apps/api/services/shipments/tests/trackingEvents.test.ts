import { describe, expect, it } from "vitest";
import {
  CUSTOMS_CLEARED,
  effectChanges,
  effectOf,
  eventsFromChanges,
  freightKindOf,
  heldFieldChanges,
  isTruckingJob,
  labelOfKind,
  plainTickRefusal,
  recordableKinds,
  recordRefusal,
  ticksFromChanges,
  TICK_EVENTS,
  TRACKING_KINDS,
} from "../lib/trackingEvents";
import { TICK_NOTICES } from "../lib/customerNotice";
import type { ShipmentRecord } from "../schemas/shipment.schema";

const sea = { tradeDirection: "Import", freightMode: "Sea Freight" };
const shipment = (over: Partial<ShipmentRecord> = {}) => ({ ...sea, actualArrival: null, actualDeparture: null, actualDeliveryDate: null, customsStatus: "", ...over }) as ShipmentRecord;

describe("the date rule: set, propose or leave alone", () => {
  it("lets a person set anything", () => {
    expect(effectOf("arrived", "user", shipment(), "2026-11-05")).toEqual({ mode: "apply", field: "actualArrival", value: "2026-11-05" });
    expect(effectOf("customs_released", "user", shipment(), "2026-11-05")).toEqual({ mode: "apply", field: "customsStatus", value: null });
  });

  for (const source of ["carrier", "document"] as const) {
    it(`only lets ${source} propose ATA, ATD and a delivery`, () => {
      expect(effectOf("arrived", source, shipment(), "2026-11-05").mode).toBe("propose");
      expect(effectOf("departed", source, shipment(), "2026-11-05").mode).toBe("propose");
      expect(effectOf("delivered", source, shipment(), "2026-11-05").mode).toBe("propose");
    });

    it(`lets ${source} set ETD and ETA only while the actual date is empty`, () => {
      expect(effectOf("eta_changed", source, shipment(), "2026-12-01").mode).toBe("apply");
      expect(effectOf("eta_changed", source, shipment({ actualArrival: "2026-11-05" }), "2026-12-01").mode).toBe("none");
      expect(effectOf("etd_changed", source, shipment(), "2026-12-01").mode).toBe("apply");
      expect(effectOf("etd_changed", source, shipment({ actualDeparture: "2026-11-05" }), "2026-12-01").mode).toBe("none");
    });

    it(`never lets ${source} touch customs or a Trucking job's delivery`, () => {
      expect(effectOf("customs_released", source, shipment(), "2026-11-05").mode).toBe("none");
      expect(effectOf("delivered", source, shipment({ department: "Road Department" }), "2026-11-05").mode).toBe("none");
      expect(effectOf("delivered", source, shipment({ tradeDirection: "Domestic" }), "2026-11-05").mode).toBe("none");
      // An international road import is no Trucking job: its delivery is proposed like any other.
      expect(effectOf("delivered", source, shipment({ freightMode: "Road Freight" }), "2026-11-05").mode).toBe("propose");
    });
  }

  it("has no effect for a fact with no field", () => {
    expect(effectOf("discharged", "user", shipment(), "2026-11-05")).toEqual({ mode: "none", field: "", value: null });
  });

  it("knows when applying would change nothing", () => {
    const effect = effectOf("arrived", "user", shipment(), "2026-11-05");
    expect(effectChanges(effect, shipment())).toBe(true);
    expect(effectChanges(effect, shipment({ actualArrival: "2026-11-05" }))).toBe(false);
    const cleared = effectOf("customs_released", "user", shipment(), "2026-11-05");
    expect(effectChanges(cleared, shipment({ customsStatus: CUSTOMS_CLEARED }))).toBe(false);
  });
});

describe("what can't be recorded", () => {
  const TODAY = "2026-11-06";
  const input = (kind: string, occurredOn = TODAY, note = "") => ({ kind, occurredOn, note });

  it("never gate in or out, or anything unknown", () => {
    expect(recordRefusal(input("gate_in"), sea, TODAY)).toContain("can't be recorded");
    expect(recordRefusal(input("gate_out"), sea, TODAY)).toContain("can't be recorded");
    expect(recordRefusal(input("constructor"), sea, TODAY)).toContain("can't be recorded");
  });

  it("nothing on a Trucking job: a Domestic one or one of the Road Department", () => {
    expect(recordRefusal(input("delivered"), { tradeDirection: "Domestic", freightMode: "" }, TODAY)).toContain("Trucking");
    expect(recordRefusal(input("delivered"), { tradeDirection: "Import", freightMode: "Road Freight", department: "Road Department" }, TODAY)).toContain("Trucking");
  });

  it("anything on an international Road Freight job, taxed by its ATA like any other", () => {
    expect(recordRefusal(input("arrived"), { tradeDirection: "Import", freightMode: "Road Freight", department: "" }, TODAY)).toBeNull();
  });

  it("an exception, a note or a changed plan with no reason", () => {
    for (const kind of ["delayed", "rolled", "hold", "note", "eta_changed", "etd_changed"]) {
      expect(recordRefusal(input(kind, TODAY, "  "), sea, TODAY)).toContain("needs a reason");
      expect(recordRefusal(input(kind, TODAY, "Storm"), sea, TODAY)).toBeNull();
    }
  });

  it("a fact in the future, a day of grace for a port ahead of Prague; a plan may lie ahead", () => {
    expect(recordRefusal(input("arrived", "2026-11-07"), sea, TODAY)).toBeNull();
    expect(recordRefusal(input("arrived", "2026-11-08"), sea, TODAY)).toContain("future");
    expect(recordRefusal(input("eta_changed", "2026-12-20", "Rolled"), sea, TODAY)).toBeNull();
  });
});

describe("the facts a change of the shipment is worth", () => {
  const NOW = new Date("2026-11-06T12:00:00Z");
  const ctx = { byPerson: true, today: "2026-11-06" };

  it("stores a typed ATA as a person's, with no hour", () => {
    expect(eventsFromChanges({ actualArrival: null }, { actualArrival: "2026-11-05" }, ctx)).toEqual([
      { kind: "arrived", occurredOn: "2026-11-05", occurredAt: null, source: "user", effect: "applied", effectField: "actualArrival", effectValue: "2026-11-05", note: "" },
    ]);
  });

  it("says a master job's sync came from the master job", () => {
    const [fact] = eventsFromChanges({}, { actualDeparture: "2026-11-05" }, { ...ctx, byPerson: false, origin: "master_job" });
    expect(fact).toMatchObject({ kind: "departed", source: "master_job" });
  });

  it("gives the app's own stamps their module, and no hour: the write's moment isn't when it happened", () => {
    const app = { ...ctx, byPerson: false };
    expect(eventsFromChanges({}, { warehouseReceivedDate: "2026-11-06" }, app)[0]).toMatchObject({ kind: "gate_in", source: "warehouse", occurredAt: null });
    expect(eventsFromChanges({}, { warehouseReleasedDate: "2026-11-05" }, app)[0]).toMatchObject({ kind: "gate_out", source: "warehouse", occurredAt: null });
    expect(eventsFromChanges({}, { actualDeliveryDate: "2026-11-06" }, app)[0]).toMatchObject({ kind: "delivered", source: "trucking", occurredAt: null });
  });

  it("takes the moment the caller knows", () => {
    expect(eventsFromChanges({}, { warehouseReceivedDate: "2026-11-06" }, { ...ctx, byPerson: false, at: NOW })[0]).toMatchObject({ kind: "gate_in", occurredAt: NOW });
  });

  it("calls the first filling-in of a plan no change", () => {
    expect(eventsFromChanges({ estimatedArrival: null }, { estimatedArrival: "2026-12-01" }, ctx)).toEqual([]);
    expect(eventsFromChanges({ estimatedArrival: "2026-11-20" }, { estimatedArrival: "2026-12-01" }, ctx)[0]).toMatchObject({ kind: "eta_changed", occurredOn: "2026-12-01" });
  });

  it("stores customs cleared, and no other customs step", () => {
    expect(eventsFromChanges({}, { customsStatus: "Under Customs Clearance" }, ctx)).toEqual([]);
    expect(eventsFromChanges({}, { customsStatus: CUSTOMS_CLEARED }, ctx)[0]).toMatchObject({ kind: "customs_released", occurredOn: "2026-11-06", occurredAt: null });
  });

  it("stores the MRN and the BoL release", () => {
    expect(eventsFromChanges({ mrn: "" }, { mrn: "26CZ1" }, ctx)[0]).toMatchObject({ kind: "mrn_issued", note: "26CZ1" });
    expect(eventsFromChanges({ houseBolRelease: "" }, { houseBolRelease: "a@b — now" }, ctx)[0]).toMatchObject({ kind: "hbl_released" });
  });

  it("stores nothing for a cleared date or an unchanged one", () => {
    expect(eventsFromChanges({ actualArrival: "2026-11-05" }, { actualArrival: null }, ctx)).toEqual([]);
    expect(eventsFromChanges({ actualArrival: "2026-11-05" }, { actualArrival: "2026-11-05" }, ctx)).toEqual([]);
    expect(eventsFromChanges({}, { vessel: "MSC ANNA" }, ctx)).toEqual([]);
  });
});

describe("the actual dates a change sets, corrects or clears", () => {
  it("names each with its new day, null when cleared", () => {
    expect(heldFieldChanges({ actualArrival: null }, { actualArrival: "2026-11-05" })).toEqual([{ field: "actualArrival", value: "2026-11-05" }]);
    expect(heldFieldChanges({ actualArrival: "2026-11-07" }, { actualArrival: "2026-11-05" })).toEqual([{ field: "actualArrival", value: "2026-11-05" }]);
    expect(heldFieldChanges({ actualDeliveryDate: "2026-11-07" }, { actualDeliveryDate: null })).toEqual([{ field: "actualDeliveryDate", value: null }]);
    expect(heldFieldChanges({ warehouseReceivedDate: "2026-11-07" }, { warehouseReceivedDate: "" })).toEqual([{ field: "warehouseReceivedDate", value: null }]);
  });

  it("names nothing unchanged, no plan and no field left out", () => {
    expect(heldFieldChanges({ actualArrival: "2026-11-05" }, { actualArrival: "2026-11-05" })).toEqual([]);
    expect(heldFieldChanges({ actualArrival: null }, { actualArrival: "" })).toEqual([]);
    expect(heldFieldChanges({ estimatedArrival: "2026-11-05" }, { estimatedArrival: "2026-11-09" })).toEqual([]);
    expect(heldFieldChanges({ actualArrival: "2026-11-05" }, { vessel: "MSC ANNA" })).toEqual([]);
  });
});

describe("the ticks a change makes true", () => {
  it("ticks Billed when the job is invoiced, by its direction", () => {
    expect(ticksFromChanges({ invoicingStatus: "Not Invoiced" }, { invoicingStatus: "Invoiced" }, "Import")).toEqual(["imp_billed"]);
    expect(ticksFromChanges({ invoicingStatus: "Not Invoiced" }, { invoicingStatus: "Invoiced" }, "Export")).toEqual(["exp_billed"]);
    expect(ticksFromChanges({ invoicingStatus: "Invoiced" }, { invoicingStatus: "Invoiced" }, "Import")).toEqual([]);
  });

  it("ticks Delivered on a new delivery date; an export has no such task", () => {
    expect(ticksFromChanges({}, { actualDeliveryDate: "2026-11-05" }, "Import")).toEqual(["imp_delivered"]);
    expect(ticksFromChanges({ actualDeliveryDate: "2026-11-05" }, { actualDeliveryDate: "2026-11-05" }, "Import")).toEqual([]);
    expect(ticksFromChanges({}, { actualDeliveryDate: "2026-11-05" }, "Export")).toEqual([]);
    expect(ticksFromChanges({ actualDeliveryDate: "2026-11-05" }, { actualDeliveryDate: null }, "Import")).toEqual([]);
  });
});

describe("the ticks that record an event", () => {
  it("only name kinds people may record", () => {
    for (const kind of Object.values(TICK_EVENTS)) expect((TRACKING_KINDS[kind] as { group?: string }).group).toBeDefined();
  });
});

describe("a plain tick", () => {
  const sea = { tradeDirection: "Import", freightMode: "Sea Freight", department: "" };
  const trucking = { tradeDirection: "Domestic", freightMode: "Road Freight", department: "" };

  it("is refused for a dated tick, pointing to the event that comes with it", () => {
    for (const key of Object.keys(TICK_EVENTS)) expect(plainTickRefusal(key, sea)).toContain("on the Tracking tab");
    expect(plainTickRefusal("imp_cargo_shipped", sea)).toBe('Record "Departed" on the Tracking tab: the tick comes with its date');
  });

  it("is refused for a tick the notice writes", () => {
    for (const key of Object.keys(TICK_NOTICES)) expect(plainTickRefusal(key, sea)).toContain("Tell the customer");
  });

  it("is refused for Billed and Delivered, which tick themselves", () => {
    expect(plainTickRefusal("imp_billed", sea)).toContain("invoiced");
    expect(plainTickRefusal("exp_billed", sea)).toContain("invoiced");
    expect(plainTickRefusal("imp_delivered", trucking)).toContain("delivery date");
  });

  it("goes through for any other task, and for a Trucking job's dated ticks, which record nothing here", () => {
    expect(plainTickRefusal("imp_booking_confirmed", sea)).toBeNull();
    expect(plainTickRefusal("imp_cargo_readiness", trucking)).toBeNull();
  });
});

describe("a Trucking job", () => {
  it("is a Domestic job or one of the Road Department, as the tax date says", () => {
    expect(isTruckingJob({ tradeDirection: "Domestic" })).toBe(true);
    expect(isTruckingJob({ tradeDirection: "Import", department: "Road Department" })).toBe(true);
    expect(isTruckingJob({ tradeDirection: "Import", department: "" })).toBe(false);
  });

  it("isn't an international Road Freight job, which still travels by road", () => {
    const road = { tradeDirection: "Import", freightMode: "Road Freight", department: "" };
    expect(isTruckingJob(road)).toBe(false);
    expect(freightKindOf(road)).toBe("road");
    expect(recordableKinds(road, true).map((k) => k.kind)).toContain("arrived");
    expect(recordableKinds({ ...road, department: "Road Department" }, true)).toEqual([]);
  });
});

describe("by freight mode", () => {
  const job = (freightMode: string, tradeDirection = "Import") => ({ freightMode, tradeDirection });

  it("tells the modes apart, sea when nothing says otherwise", () => {
    expect(freightKindOf(job("Air Freight"))).toBe("air");
    expect(freightKindOf(job("Rail Freight"))).toBe("rail");
    expect(freightKindOf(job("Road Freight"))).toBe("road");
    expect(freightKindOf(job("Sea Freight", "Domestic"))).toBe("road");
    expect(freightKindOf(job(""))).toBe("sea");
  });

  it("names a kind as that mode says it", () => {
    expect(labelOfKind("discharged", job("Air Freight"))).toBe("Ready for pick-up");
    expect(labelOfKind("arrived", job("Rail Freight"))).toBe("Arrived at the terminal");
    expect(labelOfKind("arrived", job("Sea Freight"))).toBe(TRACKING_KINDS.arrived.label);
  });

  it("offers no empty to return on a flight", () => {
    const kinds = (freightMode: string) => recordableKinds(job(freightMode), true).map((k) => k.kind);
    expect(kinds("Air Freight")).not.toContain("empty_returned");
    expect(kinds("Sea Freight")).toContain("empty_returned");
    expect(recordableKinds(job("Air Freight"), true).find((k) => k.kind === "loaded")?.label).toBe("Loaded on the flight");
  });
});
