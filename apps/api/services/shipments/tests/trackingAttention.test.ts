import { describe, expect, it } from "vitest";
import { attentionFlags, type AttentionFacts, type AttentionShipment } from "../lib/trackingAttention";
import { lastEventOf } from "../lib/trackingEvents";
import { changesTaxDate } from "../lib/taxDate";

const TODAY = "2026-11-06"; // a Friday

const shipment = (over: Partial<AttentionShipment> = {}): AttentionShipment => ({
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Arrived [IMP]",
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  etaWarehouse: null,
  warehouseReceivedDate: null,
  plannedDeliveryDate: null,
  actualDeliveryDate: null,
  ...over,
});
const facts = (over: Partial<AttentionFacts> = {}): AttentionFacts => ({ proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, ...over });
const kinds = (s: Partial<AttentionShipment>, f: Partial<AttentionFacts> = {}) => attentionFlags(shipment(s), facts(f), TODAY).map((x) => x.kind);

describe("what the dates say", () => {
  it("is nothing for a shipment still to come", () => {
    expect(kinds({ estimatedDeparture: "2026-12-01", estimatedArrival: "2026-12-20" })).toEqual([]);
  });

  it("asks for the ATA from 2 days after the ETA", () => {
    expect(kinds({ estimatedArrival: "2026-11-05" })).toEqual([]);
    expect(attentionFlags(shipment({ estimatedArrival: "2026-11-04" }), facts(), TODAY)).toEqual([
      { kind: "eta_passed", severity: "urgent", area: "tracking", label: "ETA passed, no ATA", detail: "ETA 04.11.2026, 2 days ago" },
    ]);
  });

  it("asks for the ATD of an export from 2 days after the ETD, of an import not", () => {
    expect(kinds({ tradeDirection: "Export", estimatedDeparture: "2026-11-04" })).toEqual(["etd_passed"]);
    expect(kinds({ estimatedDeparture: "2026-11-04" })).toEqual([]);
  });

  it("asks what became of the cargo 3 working days after the ATA", () => {
    // Monday to Friday: 4 working days. Wednesday to Friday: 2.
    expect(kinds({ actualArrival: "2026-11-02" })).toContain("no_onward");
    expect(kinds({ actualArrival: "2026-11-04" })).not.toContain("no_onward");
  });

  it("stops asking once the cargo moved on", () => {
    const ata = { actualArrival: "2026-11-02" };
    expect(kinds({ ...ata, warehouseReceivedDate: "2026-11-03" })).not.toContain("no_onward");
    expect(kinds({ ...ata, actualDeliveryDate: "2026-11-03" })).not.toContain("no_onward");
    expect(kinds(ata, { arrivedAtHub: true })).not.toContain("no_onward");
  });

  it("says when nothing was recorded for 2 days after departure, counting from the last event", () => {
    expect(kinds({ actualDeparture: "2026-11-04" })).toEqual(["no_event"]);
    expect(kinds({ actualDeparture: "2026-11-05" })).toEqual([]);
    expect(kinds({ actualDeparture: "2026-11-01" }, { lastEventDay: "2026-11-05" })).toEqual([]);
    expect(kinds({ actualDeparture: "2026-11-01", actualArrival: "2026-11-05" })).not.toContain("no_event");
  });

  it("shows a date waiting to be confirmed", () => {
    const f = attentionFlags(shipment(), facts({ proposed: [{ kind: "arrived", source: "carrier", effectValue: "2026-11-05", occurredOn: "2026-11-05" }] }), TODAY);
    expect(f).toEqual([{ kind: "to_confirm", severity: "urgent", area: "tracking", label: "Date to confirm", detail: "Arrived 05.11.2026 · Carrier" }]);
  });

  it("says when the customer was told a date that moved", () => {
    const f = attentionFlags(shipment({ estimatedArrival: "2026-12-16" }), facts({ lastNotice: { etaPod: "2026-12-09", etaWarehouse: null, plannedDelivery: null } }), TODAY);
    expect(f).toMatchObject([{ kind: "not_told", area: "tracking", detail: "ETA: told 09.12.2026, now 16.12.2026" }]);
  });

  it("asks nothing of a road job's sea dates: its stamps are Trucking's", () => {
    expect(kinds({ tradeDirection: "Domestic", freightMode: "Road Freight", estimatedArrival: "2026-10-01" })).toEqual([]);
  });
});

describe("what finance is told", () => {
  it("names a job not released 3 working days after the ATA or ATD", () => {
    expect(kinds({ actualArrival: "2026-11-04", warehouseReceivedDate: "2026-11-04" })).toEqual([]);
    expect(kinds({ actualArrival: "2026-11-02", warehouseReceivedDate: "2026-11-02" })).toEqual(["not_released"]);
    expect(kinds({ tradeDirection: "Export", actualDeparture: "2026-11-02", actualArrival: "2026-11-05" })).toEqual(["not_released"]);
  });

  it("doesn't once operations released it", () => {
    expect(kinds({ actualArrival: "2026-11-02", warehouseReceivedDate: "2026-11-02", status: "Billing [IMP]" })).toEqual([]);
  });

  it("warns of the tax date at 10 days and is urgent at 15, released or not", () => {
    const at = (actualArrival: string) => attentionFlags(shipment({ actualArrival, warehouseReceivedDate: actualArrival, status: "Billing [IMP]" }), facts(), TODAY);
    expect(at("2026-10-28")).toEqual([]);
    expect(at("2026-10-27")).toMatchObject([{ kind: "tax_date", severity: "attention", area: "finance", detail: "Tax date 27.10.2026, 10 days ago, no invoice" }]);
    expect(at("2026-10-22")).toMatchObject([{ kind: "tax_date", severity: "urgent" }]);
  });

  it("goes by a road job's delivery for the tax date, and leaves its release to Trucking", () => {
    const road = { tradeDirection: "Domestic", freightMode: "Road Freight", actualDeliveryDate: "2026-10-22" };
    expect(kinds(road)).toEqual(["tax_date"]);
  });

  it("names a sea job delivered and not billed", () => {
    expect(kinds({ actualDeliveryDate: "2026-11-05", actualArrival: "2026-11-05" })).toEqual(["delivered_not_billed"]);
    expect(kinds({ actualDeliveryDate: "2026-11-05", actualArrival: "2026-11-05", status: "Billing [IMP]" })).toEqual([]);
  });

  it("puts what is urgent first", () => {
    const f = attentionFlags(shipment({ actualArrival: "2026-10-20", warehouseReceivedDate: "2026-10-20" }), facts(), TODAY);
    expect(f.map((x) => x.kind)).toEqual(["tax_date", "not_released"]);
  });
});

describe("the list's Last event", () => {
  it("is empty when nothing happened", () => {
    expect(lastEventOf({}, null)).toBe("");
  });

  it("reads the actual dates of a job older than the events", () => {
    expect(lastEventOf({ actualDeparture: "2026-10-01", actualArrival: "2026-10-20" }, null)).toBe("Arrived 20.10.2026");
    expect(lastEventOf({ actualArrival: "2026-10-20", warehouseReceivedDate: "2026-10-22" }, null)).toBe("Gate in 22.10.2026");
  });

  it("takes the later of a date and an event, the event with where it came from", () => {
    expect(lastEventOf({ actualArrival: "2026-10-20" }, { kind: "discharged", occurredOn: "2026-10-21", source: "user" })).toBe("Discharged 21.10.2026");
    expect(lastEventOf({ actualArrival: "2026-10-20" }, { kind: "gate_in", occurredOn: "2026-10-20", source: "warehouse" })).toBe("Gate in 20.10.2026 · Warehouse");
    expect(lastEventOf({ actualArrival: "2026-10-22" }, { kind: "loaded", occurredOn: "2026-10-01", source: "user" })).toBe("Arrived 22.10.2026");
  });
});

describe("the tax date's lock on a job dated by its delivery", () => {
  const road = { tradeDirection: "Domestic", plannedDeliveryDate: "2026-10-20", actualDeliveryDate: "2026-10-21" };

  it("covers the delivery date", () => {
    expect(changesTaxDate(road, { actualDeliveryDate: "2026-10-22" })).toBe(true);
    expect(changesTaxDate(road, { actualDeliveryDate: "2026-10-21" })).toBe(false);
  });

  it("covers the planned date only until there is an actual one", () => {
    expect(changesTaxDate(road, { plannedDeliveryDate: "2026-10-25" })).toBe(false);
    expect(changesTaxDate({ ...road, actualDeliveryDate: null }, { plannedDeliveryDate: "2026-10-25" })).toBe(true);
  });

  it("covers a Road Department job of any direction", () => {
    expect(changesTaxDate({ tradeDirection: "Import", department: "Road Department", actualDeliveryDate: "2026-10-21" }, { actualDeliveryDate: "2026-10-22" })).toBe(true);
  });

  it("leaves any other job's delivery date alone", () => {
    expect(changesTaxDate({ tradeDirection: "Import", actualDeliveryDate: "2026-10-21" }, { actualDeliveryDate: "2026-10-22" })).toBe(false);
  });

  it("counts a switch that makes the delivery the tax date", () => {
    expect(changesTaxDate({ tradeDirection: "Import", actualDeliveryDate: "2026-10-21" }, { department: "Road Department" })).toBe(true);
  });
});

describe("free time", () => {
  const clock = (state: "chargeable" | "ending" | "running", over: object = {}) => ({ state, startDay: null, lastFreeDay: "2026-11-05", daysLeft: 1, chargeableDays: 0, stopDay: null, ...over });
  const flagsOf = (clocks: { containerNumber: string; clock: ReturnType<typeof clock> }[]) =>
    attentionFlags(shipment(), { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, clocks }, TODAY).filter((f) => f.kind === "free_time");

  it("is urgent once over, a warning before, and quiet while running", () => {
    expect(flagsOf([{ containerNumber: "AAAU1", clock: clock("chargeable", { chargeableDays: 3 }) }])).toEqual([expect.objectContaining({ severity: "urgent", area: "tracking", label: "Free time over", detail: "AAAU1 3 d over" })]);
    expect(flagsOf([{ containerNumber: "AAAU1", clock: clock("ending") }])).toEqual([expect.objectContaining({ severity: "attention", label: "Free time ends", detail: "AAAU1 in 1 d" })]);
    expect(flagsOf([{ containerNumber: "AAAU1", clock: clock("ending", { daysLeft: 0 }) }])[0]!.detail).toBe("AAAU1 today");
    expect(flagsOf([{ containerNumber: "AAAU1", clock: clock("running") }])).toEqual([]);
  });

  it("lists three boxes and counts the rest", () => {
    const boxes = ["A", "B", "C", "D", "E"].map((n) => ({ containerNumber: n, clock: clock("ending") }));
    expect(flagsOf(boxes)[0]!.detail).toBe("A in 1 d · B in 1 d · C in 1 d · and 2 more");
  });
});
