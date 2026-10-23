import { describe, expect, it } from "vitest";
import { buildAudit, buildCockpit, containerSignals, dayText, isExpectedToday, notArrivedReason, recordSignals, stampText, type CockpitInput } from "../services/managersCockpit";
import type { GateMovementItem, GateStorageInfo } from "../interfaces/gate.interfaces";
import type { WarehouseContainerItem } from "../interfaces/records.interfaces";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

// 23 Oct 2026, 12:00 in Prague (CEST, UTC+2).
const NOW = new Date("2026-10-23T10:00:00Z");
const TODAY = "2026-10-23";
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const storage = (over: Partial<GateStorageInfo> = {}): GateStorageInfo =>
  ({
    started: false,
    stopped: false,
    state: "Not started",
    freeDays: 7,
    freeDaysLeft: 7,
    daysInWarehouse: 0,
    chargeableDays: 0,
    estimatedCzk: 0,
    dailyCzk: 0,
    startDate: "",
    stopDate: "",
    lastFreeDay: "",
    wm: 1,
    startSource: "",
    ...over,
  }) as GateStorageInfo;

const running = (over: Partial<GateStorageInfo> = {}) => storage({ started: true, state: "Within free time", startDate: "2026-10-20", ...over });

let seq = 0;
const item = (over: Partial<GateMovementItem> = {}): GateMovementItem =>
  ({
    id: `m${++seq}`,
    gateRef: `G${seq}`,
    positionRef: `WCZ2026${String(seq).padStart(6, "0")}`,
    jobNumber: `CZ${String(seq).padStart(8, "0")}`,
    customer: "ACME",
    warehouseTaskId: `t${seq}`,
    visit: "výdej",
    handling: "Import",
    operationType: "LCL consolidation",
    customsMode: "",
    customsStatus: "Customs Cleared/Released",
    mrn: "26CZ0000000000001",
    status: "In Warehouse",
    gateIn: null,
    gateOut: null,
    impRelease: null,
    leftAt: null,
    eta: "",
    slot: "",
    freeDays: null,
    overridden: false,
    armed: true,
    needsAttention: false,
    pinLocked: false,
    releaseGates: [],
    openExceptions: 0,
    exceptions: [],
    events: [],
    dockSlots: [],
    transportLegs: [],
    subPositions: [],
    shipmentId: null,
    shipmentCheckedAt: null,
    shipmentUpdate: null,
    storage: storage(),
    lifecycle: { stage: "in_warehouse", label: "In warehouse", at: null, refused: false, steps: [] },
    ...over,
  }) as unknown as GateMovementItem;

const container = (over: Partial<WarehouseContainerItem> = {}): WarehouseContainerItem =>
  ({
    id: `c${++seq}`,
    number: `MSKU${seq}`,
    equipment: "40' HC",
    customer: "ACME",
    kind: "export",
    status: "Planning",
    gateInAt: null,
    closedAt: null,
    gateOutAt: null,
    positions: [],
    totals: { pieces: 0, kg: 0, cbm: 0, capacityCbm: 76, capacityKg: 26_500, fillCbmPct: 50, fillKgPct: 50, overCapacity: false },
    ...over,
  }) as unknown as WarehouseContainerItem;

const texts = (m: GateMovementItem) => recordSignals(m, TODAY, NOW).map((s) => `${s.urgent ? "U" : "A"} ${s.text}`);

const input = (over: Partial<CockpitInput> = {}): CockpitInput => ({
  items: [],
  containers: [],
  history: [],
  archived: [],
  shipmentUpdates: { pending: 0, failed: 0, blockedByFailed: 0, oldestPendingAt: null },
  storage: { inWarehouse: 0, expiring: 0, chargeable: 0, estimatedCzk: 0 },
  now: NOW,
  ...over,
});

describe("words", () => {
  it("writes Prague times and Czech dates", () => {
    expect(stampText("2026-10-23T07:12:00Z")).toBe("23.10. 09:12");
    expect(stampText(null)).toBe("");
    expect(dayText("2026-10-25")).toBe("25.10.2026");
  });
});

describe("urgent signals", () => {
  it("a refusal, with its time and reason", () => {
    const m = item({ status: "Refused", events: [{ kind: "refused", label: "Refused", at: "2026-10-23T06:00:00Z", by: "Eva", detail: "no delivery order" }] });
    expect(texts(m)).toEqual(["U Refused 23.10. 08:00: no delivery order"]);
  });

  it("a locked pick-up PIN until the cargo is released", () => {
    const at = "2026-10-23T07:12:00Z";
    expect(texts(item({ pinLocked: true, events: [{ kind: "pinLocked", label: "PIN locked", at, by: "" }] }))).toEqual(["U Pick-up PIN: locked 23.10. 09:12"]);
    expect(texts(item({ pinLocked: true, impRelease: hoursAgo(1) }))).toEqual([]);
  });

  it("an update that failed for good, even after the release", () => {
    const m = item({ impRelease: hoursAgo(30), shipmentUpdate: { state: "failed", what: ["warehouse released date"], attempts: 15, lastError: "x", nextAttemptAt: null } });
    expect(texts(m)).toEqual(["U Not sent: warehouse released date"]);
    expect(texts(item({ shipmentUpdate: { state: "pending", what: ["plate"], attempts: 1, lastError: "", nextAttemptAt: null } }))).toEqual([]);
  });

  it("an override only while it lets something pass", () => {
    const gates = [
      { g: "Customs", s: "Pending" as const, note: "" },
      { g: "Storage settled", s: "OK" as const, note: "" },
      { g: "Empty return planned", s: "Pending" as const, note: "" },
    ];
    expect(texts(item({ overridden: true, releaseGates: gates, openExceptions: 1 }))).toEqual(["U Override in force: Customs Pending, 1 open exception"]);
    expect(texts(item({ overridden: true, releaseGates: [{ g: "Customs", s: "OK", note: "" }] }))).toEqual([]);
  });

  it("the customs deadline: red overdue or ≤ 2 days, amber up to 10, nothing after it left", () => {
    const steps = (received: string) => [
      { stage: "received", label: "Received", at: received, done: true },
      { stage: "left", label: "Left", at: null, done: false },
    ];
    const t1 = (received: string) => item({ customsMode: "T1", customsStatus: "Under clearance", lifecycle: { stage: "in_warehouse", label: "In warehouse", at: null, refused: false, steps: steps(received) } });
    // Received 23 Jul → deadline 21 Oct: 2 days overdue.
    expect(texts(t1("2026-07-23"))).toContain("U Customs deadline: 2 days overdue (21.10.2026)");
    // Deadline 25 Oct: 2 days left → urgent.
    expect(texts(t1("2026-07-27"))).toContain("U Customs deadline: 2 days left (25.10.2026)");
    // Deadline 29 Oct: 6 days left → attention.
    expect(texts(t1("2026-07-31"))).toContain("A Customs deadline: 6 days left (29.10.2026)");
    // Deadline far away: nothing.
    expect(texts(t1("2026-10-01")).some((t) => t.includes("Customs deadline"))).toBe(false);
  });

  it("on hold: nothing before 24 h, amber to 48 h, red after", () => {
    const held = (h: number) => item({ openExceptions: 1, exceptions: [{ status: "open", createdAt: hoursAgo(h) }] as GateMovementItem["exceptions"] });
    expect(texts(held(5))).toEqual([]);
    expect(texts(held(30))[0]).toMatch(/^A On hold \(1\) since /);
    expect(texts(held(50))[0]).toMatch(/^U On hold \(1\) since /);
    expect(texts({ ...held(50), overridden: true } as GateMovementItem).some((t) => t.includes("On hold"))).toBe(false);
  });
});

describe("attention signals", () => {
  it("ready for release with no pick-up booked and free time running out", () => {
    const ready = (over: Partial<GateMovementItem> = {}) =>
      item({ lifecycle: { stage: "ready", label: "Ready for release", at: null, refused: false, steps: [] }, storage: running({ freeDaysLeft: 1, state: "Expiring" }), ...over });
    expect(texts(ready())).toEqual(["A Ready for release, no pick-up booked · 1 free day left"]);
    expect(texts(ready({ storage: running({ freeDaysLeft: 5 }) }))).toEqual([]);
    const booked = [{ id: "s", date: TODAY, time: "08:00", end: "09:00", dock: "Dock 1", direction: "OUT", status: "Booked", durationMin: 60, startsAt: null, endsAt: null, tripRef: "" }];
    expect(texts(ready({ dockSlots: booked }))).toEqual([]);
    expect(texts(ready({ transportLegs: [{ leg: "OUT", company: "Haulier s.r.o.", plate: "", driver: "", phone: "", gateTime: "" }] }))).toEqual([]);
  });

  it("MRN missing on outbound cargo under customs, with the request time", () => {
    const m = item({ customsStatus: "Under clearance", mrn: "—", events: [{ kind: "mrnRequested", label: "MRN requested", at: "2026-10-22T08:00:00Z", by: "Eva" }] });
    // Asked 26 hours ago: past the 24 hours it waits for an answer.
    expect(texts(m)).toEqual(["A MRN missing · requested 22.10. 10:00, no answer for 26 h"]);
    const recent = item({ customsStatus: "Under clearance", mrn: "", events: [{ kind: "mrnRequested", label: "MRN requested", at: hoursAgo(3), by: "Eva" }] });
    expect(texts(recent)).toEqual([`A MRN missing · requested ${stampText(hoursAgo(3))}`]);
    expect(texts(item({ customsStatus: "Under clearance", mrn: "", handling: "Domestic" }))).toEqual([]);
    expect(texts(item({ customsStatus: "Under clearance", mrn: "", visit: "příjem", handling: "Export" }))).toEqual([]);
  });

  it("customs status never read from a linked shipment while the Customs line is not OK", () => {
    const m = item({ shipmentId: "s1", releaseGates: [{ g: "Customs", s: "Pending", note: "" }] });
    expect(texts(m)).toEqual(["A Customs status not read from the shipment"]);
    expect(texts({ ...m, shipmentCheckedAt: hoursAgo(2) } as GateMovementItem)).toEqual([]);
  });

  it("chargeable storage whose 'Storage settled' line was never ticked by a person", () => {
    const m = item({ storage: running({ state: "Chargeable", chargeableDays: 3, estimatedCzk: 1280, freeDaysLeft: 0 }), releaseGates: [{ g: "Storage settled", s: "OK", note: "" }] });
    expect(texts(m)).toEqual(['A Storage chargeable (est. CZK 1 280), "Storage settled" OK by default']);
    const ticked = { ...m, events: [{ kind: "releaseGate", label: "Storage settled: OK", at: hoursAgo(1), by: "Eva" }] } as GateMovementItem;
    expect(texts(ticked)).toEqual([]);
  });

  it("free days above the default, with who gave them", () => {
    const m = item({ freeDays: 14, storage: running(), events: [{ kind: "storageClockChanged", label: "Free days: 14", at: hoursAgo(3), by: "Petr" }] });
    expect(texts(m)).toEqual(["A Free days: 14 (default 7) · set by Petr"]);
    expect(texts(item({ freeDays: 14 }))).toEqual([]);
  });
});

describe("containers", () => {
  it("stripping open past 24 h, closed with no gate-out past 24 h, over capacity", () => {
    const stripping = container({ kind: "import", status: "Stripping", gateInAt: hoursAgo(30), positions: [{ tallyOutcome: "", archived: false }, { tallyOutcome: "received", archived: false }] as WarehouseContainerItem["positions"] });
    expect(containerSignals(stripping, NOW).map((s) => s.text)).toEqual([`Stripping open since ${stampText(hoursAgo(30))} · 1 house not ticked`]);
    expect(containerSignals(container({ kind: "import", status: "Stripping", gateInAt: hoursAgo(3) }), NOW)).toEqual([]);
    expect(containerSignals(container({ status: "Closed", closedAt: hoursAgo(26) }), NOW).map((s) => s.text)).toEqual([`Closed ${stampText(hoursAgo(26))}, no gate-out`]);
    const over = container({ totals: { pieces: 1, kg: 1, cbm: 80, capacityCbm: 76, capacityKg: 26_500, fillCbmPct: 104.2, fillKgPct: 40, overCapacity: true } });
    expect(containerSignals(over, NOW).map((s) => s.text)).toEqual(["Over capacity: 104 % cbm"]);
  });
});

describe("expected today", () => {
  it("follows the dock slot, the ETA, the trip's arrival and an ETW, by Prague day", () => {
    const exp = (over: Partial<GateMovementItem>) => item({ status: "Expected", ...over });
    expect(isExpectedToday(exp({ eta: "2026-10-23" }), TODAY)).toBe(true);
    // 22:30 UTC on the 22nd is already the 23rd in Prague.
    expect(isExpectedToday(exp({ eta: "2026-10-22T22:30:00Z" }), TODAY)).toBe(true);
    expect(isExpectedToday(exp({ eta: "2026-10-24" }), TODAY)).toBe(false);
    const slot = { id: "s", date: TODAY, time: "08:00", end: "", dock: "Dock 1", direction: "IN", status: "Booked", durationMin: 60, startsAt: null, endsAt: null, tripRef: "" };
    expect(isExpectedToday(exp({ dockSlots: [slot] }), TODAY)).toBe(true);
    expect(isExpectedToday(exp({ dockSlots: [{ ...slot, status: "Cancelled" }] }), TODAY)).toBe(false);
    expect(isExpectedToday(exp({ subPositions: [{ etw: "2026-10-23" }] as GateMovementItem["subPositions"] }), TODAY)).toBe(true);
    expect(isExpectedToday(exp({ eta: "2026-10-23", gateIn: hoursAgo(1) }), TODAY)).toBe(false);
  });
});

describe("the cockpit", () => {
  it("puts a record once, in the card of its worst signal, with all its tags, state blockers first", () => {
    const refused = item({ status: "Refused", mrn: "", customsStatus: "Under clearance" });
    const mrnOnly = item({ mrn: "", customsStatus: "Under clearance" });
    const pin = item({ pinLocked: true });
    const c = buildCockpit(input({ items: [mrnOnly, pin, refused] }));
    expect(c.urgent.total).toBe(2);
    expect(c.urgent.rows.map((r) => r.id)).toEqual([refused.id, pin.id]);
    expect(c.urgent.rows[0]!.tags.map((t) => [t.urgent, t.text])).toEqual([
      [true, "Refused"],
      [false, "MRN missing"],
    ]);
    expect(c.attention.rows.map((r) => r.id)).toEqual([mrnOnly.id]);
    expect(c.today).toBe(TODAY);
  });

  it("counts the tiles over positions only, as the Positions chips do", () => {
    const inside = item({ storage: running({ state: "Chargeable", chargeableDays: 2, estimatedCzk: 240 }) });
    const walkIn = item({ warehouseTaskId: null, storage: running() });
    const held = item({ openExceptions: 2 });
    const c = buildCockpit(input({ items: [inside, walkIn, held] }));
    expect(c.tiles).toMatchObject({ inWarehouse: 2, chargeable: 1, chargeableCzk: 240, onHold: 1, needsAttention: 1 });
  });

  it("lists containers with their own rows", () => {
    const c = buildCockpit(input({ containers: [container({ status: "Closed", closedAt: hoursAgo(30) })] }));
    expect(c.attention.rows[0]).toMatchObject({ kind: "container", direction: "Export container", lifecycle: "Closed" });
  });
});

describe("audit line", () => {
  it("counts the last 7 days; one void of several stamps counts once", () => {
    const at = hoursAgo(5);
    const old = hoursAgo(24 * 8);
    const audit = buildAudit(
      [
        {
          events: [
            { kind: "override", label: "", at, by: "Petr" },
            { kind: "override", label: "", at: old, by: "Petr" },
            { kind: "stampVoided", label: "WH release voided", at, by: "Petr" },
            { kind: "stampVoided", label: "Gate-out voided", at, by: "Petr" },
            { kind: "refused", label: "", at, by: "Eva" },
            { kind: "shipmentDeleted", label: "", at, by: "" },
          ],
        },
      ],
      [
        { archivedAt: at, stamped: true },
        { archivedAt: at, stamped: false },
        { archivedAt: old, stamped: true },
      ],
      NOW,
    );
    expect(audit).toEqual({ days: 7, overrides: 1, overridesPastCustoms: 0, voids: 1, refusals: 1, archivedWithStamps: 1, shipmentsDeleted: 1 });
  });
});

// ─── Step 2 ────────────────────────────────────────────────────

const tripSource = (tripRef: string) => ({ kind: "trucking", tripRef }) as unknown as GateMovementItem["transportLegs"][number]["source"];
const slot = (over: Partial<GateMovementItem["dockSlots"][number]>) => ({ id: "s", date: TODAY, time: "08:00", end: "09:00", dock: "Dock 2", direction: "IN", status: "Booked", durationMin: 60, startsAt: null, endsAt: null, tripRef: "", ...over });

describe("time passed (step 2)", () => {
  it("expected and not arrived: a dock slot that ended, a trip 2 h late, an ETW before today — never the vessel's ETA", () => {
    const exp = (over: Partial<GateMovementItem>) => item({ status: "Expected", visit: "příjem", handling: "Export", ...over });
    // The slot 08:00–09:00 Prague ended at 07:00 UTC; it is 10:00 UTC.
    expect(notArrivedReason(exp({ dockSlots: [slot({ endsAt: "2026-10-23T07:00:00Z" })] }), TODAY, NOW)).toBe("Not arrived: dock slot Dock 2 23.10. 08:00–09:00 passed");
    expect(notArrivedReason(exp({ dockSlots: [slot({ endsAt: "2026-10-23T11:00:00Z" })] }), TODAY, NOW)).toBeNull();
    expect(notArrivedReason(exp({ dockSlots: [slot({ endsAt: "2026-10-23T07:00:00Z", direction: "OUT" })] }), TODAY, NOW)).toBeNull();
    const trip = (gateTime: string) => exp({ transportLegs: [{ leg: "IN", company: "", plate: "", driver: "", phone: "", gateTime, source: tripSource("LCZ2026000042") }] });
    expect(notArrivedReason(trip(hoursAgo(3)), TODAY, NOW)).toBe(`Not arrived: trip LCZ2026000042 due ${stampText(hoursAgo(3))}`);
    expect(notArrivedReason(trip(hoursAgo(1)), TODAY, NOW)).toBeNull();
    expect(notArrivedReason(exp({ subPositions: [{ etw: "2026-10-22" }] as GateMovementItem["subPositions"] }), TODAY, NOW)).toBe("Not arrived: expected 22.10.2026");
    expect(notArrivedReason(exp({ eta: "2026-10-20" }), TODAY, NOW)).toBeNull();
    expect(notArrivedReason(exp({ gateIn: hoursAgo(1), subPositions: [{ etw: "2026-10-22" }] as GateMovementItem["subPositions"] }), TODAY, NOW)).toBeNull();
    expect(texts(exp({ subPositions: [{ etw: "2026-10-22" }] as GateMovementItem["subPositions"] }))).toEqual(["U Not arrived: expected 22.10.2026"]);
  });

  it("a release request still blocked after 2 h, naming the waiting gates", () => {
    const req = (h: number, armed = false) =>
      item({ armed, releaseGates: [{ g: "B/L / release order", s: "Pending", note: "" }], events: [{ kind: "releaseRequested", label: "Release requested", at: hoursAgo(h), by: "Eva" }] });
    expect(texts(req(3))).toEqual([`U Release requested ${stampText(hoursAgo(3))}: blocked 3 h · B/L / release order`]);
    expect(texts(req(1))).toEqual([]);
    expect(texts(req(3, true))).toEqual([]);
  });

  it("an inbound truck gated in and not received: amber after 4 h, red after 8 h, not for Domestic", () => {
    const arrived = (h: number, over: Partial<GateMovementItem> = {}) => item({ visit: "příjem", handling: "Export", gateIn: hoursAgo(h), ...over });
    expect(texts(arrived(2))).toEqual([]);
    expect(texts(arrived(5))).toEqual([`A Arrived ${stampText(hoursAgo(5))}, not received (5 h)`]);
    expect(texts(arrived(9, { needsReweigh: true, reweigh: null }))).toEqual([`U Arrived ${stampText(hoursAgo(9))}, not received (9 h) · waiting for re-weigh`]);
    expect(texts(arrived(9, { handling: "Domestic" }))).toEqual([]);
    expect(texts(arrived(9, { expReceipt: hoursAgo(1) }))).toEqual([]);
  });

  it("a linked record whose customs status was last read more than a day ago", () => {
    const m = item({ shipmentId: "s1", releaseGates: [{ g: "Customs", s: "Pending", note: "" }], shipmentCheckedAt: hoursAgo(30) });
    expect(texts(m)).toEqual([`A Customs status last read from the shipment ${stampText(hoursAgo(30))}`]);
    // A deleted shipment is not read any more: no "not read" tag, the deletion tag instead.
    const gone = { ...m, events: [{ kind: "shipmentDeleted", label: "", at: hoursAgo(40), by: "" }] } as GateMovementItem;
    expect(texts(gone)).toEqual(["A Shipment deleted in Shipments, position kept — archive it with a reason"]);
  });

  it("released with storage charged and 'Storage settled' never ticked, for 7 days", () => {
    const released = (days: number) =>
      item({ impRelease: hoursAgo(days * 24), storage: storage({ started: true, stopped: true, state: "Chargeable", chargeableDays: 3, estimatedCzk: 500 }), releaseGates: [{ g: "Storage settled", s: "OK", note: "" }] });
    expect(texts(released(2))).toEqual([`A Released ${stampText(hoursAgo(48))} with storage chargeable (est. CZK 500), "Storage settled" never ticked`]);
    expect(texts(released(9))).toEqual([]);
  });

  it("a Trucking trip today that got no dock slot", () => {
    const leg = { leg: "IN" as const, company: "", plate: "", driver: "", phone: "", gateTime: "2026-10-23T12:00:00Z", source: tripSource("LCZ2026000007") };
    const m = item({ status: "Expected", visit: "příjem", handling: "Export", transportLegs: [leg] });
    expect(texts(m)).toEqual(["A Trip LCZ2026000007 today 14:00, no dock slot"]);
    expect(texts({ ...m, dockSlots: [slot({ tripRef: "LCZ2026000007" })] } as GateMovementItem)).toEqual([]);
  });

  it("a shipment that may need correcting, until it is dismissed (step 3: no 7-day limit)", () => {
    const at = hoursAgo(24 * 8);
    expect(texts(item({ correctionNeeded: { at, detail: "" } }))).toEqual([
      `A Shipment may need correcting (${stampText(at)}): a stamp was voided after it reached Shipments — dismiss it on the gate job once corrected`,
    ]);
    expect(texts(item({ correctionNeeded: null }))).toEqual([]);
  });

  it("events for Trucking that failed for good are urgent, with the shipment's own", () => {
    const m = item({ impRelease: hoursAgo(30) });
    const c = buildCockpit(
      input({
        items: [m],
        truckingNotSent: new Map([[m.id, ["gate-in", "gate-out", "gate-in"]]]),
        delivery: { shipmentUpdatesWaiting: 1, truckingFailed: 3, truckingWaiting: 0, staleMinutes: 30, supplierEmailsFailed: 2, supplierEmailDays: 7 },
      }),
    );
    expect(c.urgent.rows[0]!.tags).toEqual([{ text: "Not sent to Trucking: gate-in, gate-out", urgent: true }]);
    expect(c.delivery).toMatchObject({ truckingFailed: 3, supplierEmailsFailed: 2 });
  });
});

// ─── Step 3 ────────────────────────────────────────────────────

describe("step 3 signals", () => {
  const house = (over: Record<string, unknown>) => ({ archived: false, stuffedAt: null, tallyOutcome: "", etd: "", closingDate: "", ...over });

  it("export stuffing against the closing date: red 2 days or fewer, amber up to 5; ETD when there is no closing", () => {
    const box = (positions: Record<string, unknown>[]) => container({ status: "Stuffing", positions: positions as unknown as WarehouseContainerItem["positions"] });
    expect(containerSignals(box([house({ closingDate: "2026-10-25" }), house({ closingDate: "2026-10-28" })]), NOW).map((s) => [s.urgent, s.text])).toEqual([
      [true, "Stuffing: 2 houses not stuffed · closing in 2 days (25.10.2026)"],
    ]);
    expect(containerSignals(box([house({ closingDate: "2026-10-27" })]), NOW).map((s) => [s.urgent, s.text])).toEqual([[false, "Stuffing: 1 house not stuffed · closing in 4 days (27.10.2026)"]]);
    expect(containerSignals(box([house({ etd: "2026-10-24" })]), NOW).map((s) => s.text)).toEqual(["Stuffing: 1 house not stuffed · ETD in 1 day (24.10.2026)"]);
    expect(containerSignals(box([house({ closingDate: "2026-11-10" })]), NOW)).toEqual([]);
    // Every house stuffed: nothing left to stuff.
    expect(containerSignals(box([house({ closingDate: "2026-10-24", stuffedAt: hoursAgo(1) })]), NOW)).toEqual([]);
  });

  it("detention on our yard: red 2 days or fewer before it expires, and after", () => {
    const yard = (detentionExpiry: string, gatedOut = "") => container({ kind: "import", status: "Stripped", gatedIn: "2026-10-10", gatedOut, detentionExpiry } as Partial<WarehouseContainerItem>);
    expect(containerSignals(yard("2026-10-24"), NOW).map((s) => [s.urgent, s.text])).toEqual([[true, "Detention expires in 1 day (24.10.2026) — book the empty return"]]);
    expect(containerSignals(yard("2026-10-21"), NOW).map((s) => s.text)).toEqual(["Detention expired 2 days ago (21.10.2026) — book the empty return"]);
    expect(containerSignals(yard("2026-11-01"), NOW)).toEqual([]);
    expect(containerSignals(yard("2026-10-21", "2026-10-22"), NOW)).toEqual([]);
  });

  it("a discarded floor write for 7 days, and goods that left under customs with no document", () => {
    const lost = (h: number) => item({ events: [{ kind: "floorWriteLost", label: "Floor mode: Gate-in — discarded on the phone, not sent", at: hoursAgo(h), by: "Eva" }] });
    expect(texts(lost(3))).toEqual(["A Floor mode discarded 1 write on the phone: Gate-in"]);
    expect(texts(lost(24 * 8))).toEqual([]);
    const left = item({ impRelease: hoursAgo(48) });
    expect(recordSignals(left, TODAY, NOW, { leftWithoutDocument: "Transit T1" }).map((s) => s.text)).toEqual([
      "Left under customs control (T1 transit) with no MRN or customs document — attach it in the Bonded Register",
    ]);
  });

  it("the audit line counts overrides given past a Customs line that was not OK", () => {
    const at = hoursAgo(2);
    const audit = buildAudit(
      [{ events: [{ kind: "override", label: "", at, by: "", gates: [{ g: "Customs", s: "Pending" }] }, { kind: "override", label: "", at, by: "", gates: [{ g: "Customs", s: "OK" }] }] }],
      [],
      NOW,
    );
    expect(audit).toMatchObject({ overrides: 2, overridesPastCustoms: 1 });
  });
});
