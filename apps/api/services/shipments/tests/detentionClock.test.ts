import { describe, expect, it } from "vitest";
import { clockApplies, clockOf, detentionClock, type ClockEvent } from "../lib/detentionClock";

const TODAY = "2026-11-10";
const input = (over: Partial<Parameters<typeof detentionClock>[0]> = {}) => ({
  freeTimeDays: 5,
  freeTimeFrom: "discharge",
  lastFreeDayStated: null,
  discharged: "2026-11-01",
  gateOut: null,
  emptyReturned: null,
  today: TODAY,
  ...over,
});

describe("detentionClock", () => {
  it("counts from the day after the start", () => {
    expect(detentionClock(input({ freeTimeDays: 14 }))).toMatchObject({ state: "running", startDay: "2026-11-01", lastFreeDay: "2026-11-15", daysLeft: 5, chargeableDays: 0 });
  });

  it("warns with two days left and on the last day", () => {
    expect(detentionClock(input({ freeTimeDays: 11 })).state).toBe("ending");
    expect(detentionClock(input({ freeTimeDays: 9 }))).toMatchObject({ state: "ending", daysLeft: 0, chargeableDays: 0 });
  });

  it("charges the days past the last free day", () => {
    expect(detentionClock(input())).toMatchObject({ state: "chargeable", lastFreeDay: "2026-11-06", daysLeft: -4, chargeableDays: 4 });
  });

  it("stops at the return and keeps what it came to", () => {
    expect(detentionClock(input({ emptyReturned: "2026-11-08" }))).toMatchObject({ state: "returned", chargeableDays: 2, stopDay: "2026-11-08" });
    expect(detentionClock(input({ emptyReturned: "2026-11-03" }))).toMatchObject({ state: "returned", chargeableDays: 0 });
  });

  it("can start from the gate-out", () => {
    expect(detentionClock(input({ freeTimeFrom: "gate_out" })).state).toBe("not_started");
    expect(detentionClock(input({ freeTimeFrom: "gate_out", gateOut: "2026-11-07" }))).toMatchObject({ state: "ending", lastFreeDay: "2026-11-12", startDay: "2026-11-07" });
  });

  it("takes the carrier's stated day over counting, even before it starts", () => {
    expect(detentionClock(input({ lastFreeDayStated: "2026-11-20" }))).toMatchObject({ state: "running", lastFreeDay: "2026-11-20" });
    expect(detentionClock(input({ discharged: null, freeTimeDays: null, lastFreeDayStated: "2026-11-20" })).lastFreeDay).toBe("2026-11-20");
  });

  it("says when nothing is known yet", () => {
    expect(detentionClock(input({ freeTimeDays: null })).state).toBe("unknown");
    expect(detentionClock(input({ discharged: null })).state).toBe("not_started");
  });

  it("takes zero free days as zero", () => {
    expect(detentionClock(input({ freeTimeDays: 0 })).lastFreeDay).toBe("2026-11-01");
  });
});

describe("clockOf", () => {
  const box = { containerNumber: "CSQU3054383", freeTimeDays: 5, freeTimeFrom: "discharge", lastFreeDay: null };
  const event = (kind: string, occurredOn: string, containerNumber = "", effect = "none"): ClockEvent => ({ kind, occurredOn, containerNumber, effect });

  it("prefers what was said of the box over the whole shipment", () => {
    const clock = clockOf(box, [event("discharged", "2026-11-01"), event("discharged", "2026-11-05", "CSQU3054383")], TODAY);
    expect(clock.startDay).toBe("2026-11-05");
  });

  it("reads an event of the whole shipment for every box, but not another box's", () => {
    expect(clockOf(box, [event("discharged", "2026-11-01")], TODAY).startDay).toBe("2026-11-01");
    expect(clockOf(box, [event("discharged", "2026-11-01", "MSKU1234565")], TODAY).startDay).toBeNull();
  });

  it("takes the earliest, and no dismissed or proposed fact", () => {
    expect(clockOf(box, [event("discharged", "2026-11-03"), event("discharged", "2026-11-02")], TODAY).startDay).toBe("2026-11-02");
    expect(clockOf(box, [event("discharged", "2026-11-03", "", "dismissed"), event("discharged", "2026-11-02", "", "proposed")], TODAY).startDay).toBeNull();
  });

  it("stops at the empty's return", () => {
    expect(clockOf(box, [event("discharged", "2026-11-01"), event("empty_returned", "2026-11-04")], TODAY).state).toBe("returned");
  });
});

describe("clockApplies", () => {
  it("is an import by sea or rail", () => {
    expect(clockApplies({ tradeDirection: "Import", freightMode: "Sea Freight" })).toBe(true);
    expect(clockApplies({ tradeDirection: "Import", freightMode: "Rail Freight" })).toBe(true);
    expect(clockApplies({ tradeDirection: "Export", freightMode: "Sea Freight" })).toBe(false);
    expect(clockApplies({ tradeDirection: "Import", freightMode: "Air Freight" })).toBe(false);
    expect(clockApplies({ tradeDirection: "Domestic", freightMode: "Road Freight" })).toBe(false);
  });
});
