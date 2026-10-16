import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { chipMatch, containerScanMatch, dockSlotText, exceptionText, isOnHold, releasedOn, expectedBecause, expectedSortKey, isExpectedToday, normalizeScan, pragueDate, pragueToday, scanMatch } from "./worklist";

type M = interfaces.GateMovementItem;

const storage = (over: Partial<interfaces.GateStorageInfo> = {}): interfaces.GateStorageInfo => ({
  started: false,
  startDate: "",
  startSource: "",
  stopped: false,
  stopDate: "",
  daysInWarehouse: 0,
  freeDays: 7,
  freeDaysLeft: 7,
  lastFreeDay: "",
  chargeableDays: 0,
  wm: 0,
  dailyCzk: 120,
  estimatedCzk: 0,
  state: "Not started",
  ...over,
});

const mv = (over: Partial<M> = {}): M =>
  ({
    id: "m1",
    gateRef: "WCZ2026000001",
    positionRef: "WCZ2026000001",
    jobNumber: "",
    containerNumber: "",
    plate: "",
    containers: [],
    transportLegs: [],
    status: "Expected",
    visit: "příjem",
    gateIn: null,
    gateOut: null,
    impRelease: null,
    eta: "",
    slot: "",
    subPositions: [],
    dockSlots: [],
    needsAttention: false,
    openExceptions: 0,
    shipmentUpdate: null,
    storage: storage(),
    ...over,
  }) as M;

describe("Prague dates", () => {
  it("turns a time into the Prague day, also around midnight", () => {
    expect(pragueDate("2026-10-14T22:30:00Z")).toBe("2026-10-15"); // 00:30 in Prague (CEST)
    expect(pragueDate("2026-10-14T21:59:00Z")).toBe("2026-10-14");
    expect(pragueDate("2026-12-31T23:30:00Z")).toBe("2027-01-01"); // CET
    expect(pragueDate(null)).toBe("");
    expect(pragueDate("not a date")).toBe("");
    expect(pragueToday(new Date("2026-10-14T22:30:00Z"))).toBe("2026-10-15");
  });
});

describe("expected today", () => {
  const today = "2026-10-14";
  it("matches the ETA, the slot or a sub-position ETW of a movement not yet arrived", () => {
    expect(isExpectedToday(mv({ eta: "2026-10-14" }), today)).toBe(true);
    expect(isExpectedToday(mv({ eta: "2026-10-13T22:30:00Z" }), today)).toBe(true); // 00:30 Prague on the 14th
    expect(isExpectedToday(mv({ slot: "2026-10-14 08:00" }), today)).toBe(true);
    expect(isExpectedToday(mv({ subPositions: [{ etw: "2026-10-14" } as interfaces.GateSubPosition] }), today)).toBe(true);
    expect(isExpectedToday(mv({ eta: "2026-10-15" }), today)).toBe(false);
  });
  it("leaves out arrived movements", () => {
    expect(isExpectedToday(mv({ eta: today, gateIn: "2026-10-14T06:00:00Z" }), today)).toBe(false);
    expect(isExpectedToday(mv({ eta: today, status: "In Warehouse" }), today)).toBe(false);
  });
  it("says why", () => {
    expect(expectedBecause(mv({ eta: today, slot: "2026-10-14 08:00" }), today)).toBe("Slot 08:00 · ETA");
  });

  const slot = (over: Partial<interfaces.GateDockSlot> = {}): interfaces.GateDockSlot => ({
    id: "s1",
    date: today,
    time: "08:00",
    end: "09:00",
    dock: "Dock 2",
    direction: "IN",
    status: "Booked",
    durationMin: 60,
    startsAt: "2026-10-14T06:00:00.000Z",
    endsAt: "2026-10-14T07:00:00.000Z",
    tripRef: "",
    ...over,
  });
  it("uses the dock slot booked in Dock & Yard first", () => {
    expect(isExpectedToday(mv({ dockSlots: [slot()] }), today)).toBe(true);
    expect(isExpectedToday(mv({ dockSlots: [slot({ date: "2026-10-15" })] }), today)).toBe(false);
    // A cancelled or completed slot no longer makes it expected.
    expect(isExpectedToday(mv({ dockSlots: [slot({ status: "Cancelled" })] }), today)).toBe(false);
    expect(isExpectedToday(mv({ dockSlots: [slot({ status: "Completed" })] }), today)).toBe(false);
    expect(expectedBecause(mv({ eta: today, dockSlots: [slot()], slot: "2026-10-14 07:00" }), today)).toBe("Slot 08:00 · Dock 2 · ETA");
    // No booked slot: the older slot text still counts.
    expect(expectedBecause(mv({ slot: "2026-10-14 07:00" }), today)).toBe("Slot 07:00");
  });
  it("sorts by the slot time today, then the slot text and ETA times, untimed last", () => {
    const list = [
      mv({ id: "eta", eta: today }),
      mv({ id: "late", dockSlots: [slot({ time: "14:30" })] }),
      mv({ id: "early", dockSlots: [slot({ time: "07:15" }), slot({ id: "s2", time: "12:00" })] }),
      mv({ id: "text", slot: "2026-10-14 09:00" }),
      mv({ id: "etaTime", eta: "2026-10-14T08:00:00Z" }), // 10:00 Prague
    ];
    const sorted = [...list].sort((a, b) => expectedSortKey(a, today).localeCompare(expectedSortKey(b, today)));
    expect(sorted.map((m) => m.id)).toEqual(["early", "text", "etaTime", "late", "eta"]);
  });
  it("counts the arrival a Trucking trip plans today (its IN leg), even without a dock slot", () => {
    const leg = (over: Partial<interfaces.GateTransportLeg> = {}): interfaces.GateTransportLeg => ({
      leg: "IN",
      company: "Rapid",
      plate: "1AB 2345",
      driver: "",
      phone: "",
      gateTime: "2026-10-14T08:00:00.000Z",
      source: { kind: "trucking", tripRef: "LCZ26-0001" },
      ...over,
    });
    expect(isExpectedToday(mv({ transportLegs: [leg()] }), today)).toBe(true);
    expect(expectedBecause(mv({ transportLegs: [leg()] }), today)).toBe("From trip LCZ26-0001 10:00");
    expect(expectedSortKey(mv({ transportLegs: [leg()] }), today)).toBe("10:00");
    // A leg typed by hand, another day or an arrived truck does not.
    expect(isExpectedToday(mv({ transportLegs: [leg({ source: null })] }), today)).toBe(false);
    expect(isExpectedToday(mv({ transportLegs: [leg({ gateTime: "2026-10-15T08:00:00.000Z" })] }), today)).toBe(false);
    expect(isExpectedToday(mv({ transportLegs: [leg()], gateIn: "2026-10-14T08:05:00Z" }), today)).toBe(false);
    // The booked slot wins the wording.
    expect(expectedBecause(mv({ transportLegs: [leg()], dockSlots: [slot()] }), today)).toBe("Slot 08:00 · Dock 2");
  });
  it("words a dock slot", () => {
    expect(dockSlotText(slot())).toBe("Dock 2 · 14 Oct 08:00–09:00 · Booked");
    expect(dockSlotText(slot({ end: "" }))).toBe("Dock 2 · 14 Oct 08:00 · Booked");
  });
});

describe("Positions chips", () => {
  const today = "2026-10-14";
  it("needs attention: blocked / MRN, an open exception or a failed shipment update", () => {
    expect(chipMatch("attention", mv({ needsAttention: true }), today)).toBe(true);
    expect(chipMatch("attention", mv({ openExceptions: 1 }), today)).toBe(true);
    expect(chipMatch("attention", mv({ shipmentUpdate: { state: "failed", what: [], attempts: 3, lastError: "", nextAttemptAt: null } }), today)).toBe(true);
    expect(chipMatch("attention", mv({ shipmentUpdate: { state: "pending", what: [], attempts: 1, lastError: "", nextAttemptAt: null } }), today)).toBe(false);
    expect(chipMatch("attention", mv(), today)).toBe(false);
  });
  it("in warehouse, expiring and chargeable follow the storage clock", () => {
    const running = storage({ started: true, startDate: "2026-10-08", daysInWarehouse: 7, freeDaysLeft: 0, state: "Expiring" });
    expect(chipMatch("inWarehouse", mv({ storage: running }), today)).toBe(true);
    expect(chipMatch("expiring", mv({ storage: running }), today)).toBe(true);
    expect(chipMatch("chargeable", mv({ storage: running }), today)).toBe(false);
    const charged = storage({ started: true, daysInWarehouse: 9, chargeableDays: 2, state: "Chargeable" });
    expect(chipMatch("chargeable", mv({ storage: charged }), today)).toBe(true);
    // Outbound cargo gone out: no longer in the warehouse, so neither expiring nor chargeable.
    const gone = storage({ ...charged, stopped: true, stopDate: today });
    const out = { visit: "výdej", status: "Released", storage: gone, impRelease: "2026-10-14T08:00:00Z", gateOut: "2026-10-14T08:00:00Z" } as const;
    expect(chipMatch("inWarehouse", mv(out), today)).toBe(false);
    expect(chipMatch("chargeable", mv(out), today)).toBe(false);
    // Inbound truck gone out: the cargo stays in the warehouse and keeps being charged.
    const truckOut = { visit: "příjem", status: "In Warehouse", storage: charged, gateIn: "2026-10-06T08:00:00Z", gateOut: "2026-10-06T09:00:00Z" } as const;
    expect(chipMatch("inWarehouse", mv(truckOut), today)).toBe(true);
    expect(chipMatch("chargeable", mv(truckOut), today)).toBe(true);
    // No storage clock yet: the status decides; an inbound gate-out does not take it out.
    expect(chipMatch("inWarehouse", mv({ status: "In Warehouse", gateOut: "2026-10-14T08:00:00Z" }), today)).toBe(true);
    expect(chipMatch("inWarehouse", mv({ status: "In Warehouse", visit: "výdej", gateOut: "2026-10-14T08:00:00Z" }), today)).toBe(false);
  });
  it("on hold = an open exception, until the WH release", () => {
    expect(chipMatch("onHold", mv({ openExceptions: 2 }), today)).toBe(true);
    expect(chipMatch("onHold", mv(), today)).toBe(false);
    expect(chipMatch("onHold", mv({ openExceptions: 1, visit: "výdej", impRelease: "2026-10-14T08:00:00Z" }), today)).toBe(false);
    expect(exceptionText(mv({ openExceptions: 2 }))).toBe("On hold (2)");
    expect(exceptionText(mv({ openExceptions: 1, impRelease: "2026-10-14T08:00:00Z" }))).toBe("Open exception (1)");
    expect(exceptionText(mv())).toBe("");
  });
  it("released today: the WH release in Prague time; an inbound truck's gate-out is not a release", () => {
    expect(chipMatch("releasedToday", mv({ visit: "výdej", impRelease: "2026-10-14T09:00:00Z" }), today)).toBe(true);
    expect(chipMatch("releasedToday", mv({ visit: "výdej", impRelease: "2026-10-13T22:30:00Z" }), today)).toBe(true);
    expect(chipMatch("releasedToday", mv({ visit: "výdej", gateOut: "2026-10-14T09:00:00Z" }), today)).toBe(false);
    expect(chipMatch("releasedToday", mv({ visit: "příjem", gateOut: "2026-10-14T09:00:00Z" }), today)).toBe(false);
    expect(chipMatch("expectedToday", mv({ eta: today }), today)).toBe(true);
  });
});

describe("scan or type", () => {
  const a = mv({ id: "a", gateRef: "WCZ2026000001", positionRef: "WCZ2026000001", jobNumber: "JOB-1", containerNumber: "MSCU1234567" });
  const b = mv({ id: "b", gateRef: "— walk-in", positionRef: "", plate: "9C8 1122" });
  const c = mv({ id: "c", gateRef: "WCZ2026000003", positionRef: "WCZ2026000003", jobNumber: "JOB-1" });
  it("normalises what was scanned", () => {
    expect(normalizeScan("  wcz 2026 000001\n")).toBe("WCZ2026000001");
  });
  it("opens the job of a scanned label", () => {
    expect(scanMatch("wcz2026000001", [a, b, c])).toEqual({ kind: "open", movement: a });
  });
  it("opens a single match on container or plate, lists several", () => {
    expect(scanMatch("mscu 1234567", [a, b, c])).toEqual({ kind: "open", movement: a });
    expect(scanMatch("9c81122", [a, b, c])).toEqual({ kind: "open", movement: b });
    expect(scanMatch("job-1", [a, b, c])).toEqual({ kind: "many", matches: [a, c] });
  });
  it("finds nothing for an unknown or empty value", () => {
    expect(scanMatch("WCZ2099000001", [a, b, c])).toEqual({ kind: "none" });
    expect(scanMatch("   ", [a, b, c])).toEqual({ kind: "none" });
  });
});

describe("containers in the worklist", () => {
  const T = "2026-10-14T08:00:00.000Z";
  const house = (id: string, number: string) => ({ container: { id, number } as NonNullable<M["container"]> });
  it("finds the one container a scanned number belongs to", () => {
    expect(containerScanMatch("mscu 123456 5", [house("c1", "MSCU1234565"), house("c1", "MSCU1234565"), { container: null }])).toEqual({ id: "c1", number: "MSCU1234565" });
    expect(containerScanMatch("TGHU0000000", [house("c1", "MSCU1234565")])).toBeNull();
    expect(containerScanMatch("", [house("c1", "MSCU1234565")])).toBeNull();
  });
  it("counts the stuffed container's gate-out as the release, after which nothing is on hold", () => {
    expect(releasedOn({ visit: "příjem", impRelease: null, gateOut: null, leftAt: T })).toBe("2026-10-14");
    expect(isOnHold({ openExceptions: 1, impRelease: null, overridden: false, leftAt: T })).toBe(false);
    expect(isOnHold({ openExceptions: 1, impRelease: null, overridden: false })).toBe(true);
  });
});
