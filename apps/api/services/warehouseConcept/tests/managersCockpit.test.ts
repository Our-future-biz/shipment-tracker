import { describe, expect, it } from "vitest";
import { buildAudit, buildCockpit, containerSignals, dayText, isExpectedToday, recordSignals, stampText, type CockpitInput } from "../services/managersCockpit";
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
    expect(texts(m)).toEqual(["A MRN missing · requested 22.10. 10:00"]);
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
    expect(audit).toEqual({ days: 7, overrides: 1, voids: 1, refusals: 1, archivedWithStamps: 1, shipmentsDeleted: 1 });
  });
});
