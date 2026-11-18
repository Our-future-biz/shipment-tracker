import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCockpit, stampText, type CockpitInput } from "../services/managersCockpit";
import { buildOperationsFacts, operationsShipmentIds, type OperationsFactsInput } from "../services/operationsFacts";
import type { GateMovementItem, GateStorageInfo } from "../interfaces/gate.interfaces";
import type { WarehouseContainerItem } from "../interfaces/records.interfaces";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

// 23 Oct 2026, 12:00 in Prague (CEST, UTC+2).
const NOW = new Date("2026-10-23T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";

const storage = (over: Partial<GateStorageInfo> = {}): GateStorageInfo =>
  ({ started: false, stopped: false, state: "Not started", freeDays: 7, freeDaysLeft: 7, daysInWarehouse: 0, chargeableDays: 0, estimatedCzk: 0, dailyCzk: 0, startDate: "", stopDate: "", lastFreeDay: "", wm: 1, startSource: "", ...over }) as GateStorageInfo;

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
    shipmentId: S1,
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

const facts = (over: Partial<OperationsFactsInput> = {}): OperationsFactsInput => ({
  shipmentIds: [S1, S2],
  records: { rows: [], items: [], truckingNotSent: new Map(), leftWithoutDocument: new Map() },
  containers: { items: [], movementIds: new Map() },
  updates: new Map(),
  notKnown: [],
  now: NOW,
  ...over,
});

const records = (items: GateMovementItem[], over: Partial<NonNullable<OperationsFactsInput["records"]>> = {}) => ({
  rows: items.map((m) => ({ id: m.id, shipmentId: m.shipmentId })),
  items,
  truckingNotSent: new Map<string, string[]>(),
  leftWithoutDocument: new Map<string, string>(),
  ...over,
});

const cockpitInput = (over: Partial<CockpitInput>): CockpitInput => ({
  items: [],
  containers: [],
  history: [],
  archived: [],
  shipmentUpdates: { pending: 0, failed: 0, blockedByFailed: 0, oldestPendingAt: null },
  storage: { inWarehouse: 0, expiring: 0, chargeable: 0, estimatedCzk: 0 },
  now: NOW,
  ...over,
});

describe("the shipment ids answered", () => {
  it("are uuids, each once, in the order asked", () => {
    expect(operationsShipmentIds([S2, "CZ00000053", S1, ` ${S2} `, ""])).toEqual([S2, S1]);
  });
});

describe("a shipment's warehouse records", () => {
  it("carry the Warehouse cockpit's own tags, in its order — the same as its row on Warehouse → Managers", () => {
    const refused = item({ status: "Refused", mrn: "", customsStatus: "Under clearance", events: [{ kind: "refused", label: "Refused", at: hoursAgo(2), by: "Eva", detail: "no delivery order" }] });
    const failedTrucking = item({ lifecycle: { stage: "ready", label: "Ready for release", at: null, refused: false, steps: [] } as unknown as GateMovementItem["lifecycle"] });
    const left = item({ impRelease: hoursAgo(5), lifecycle: { stage: "left", label: "Left", at: null, refused: false, steps: [] } as unknown as GateMovementItem["lifecycle"] });
    const truckingNotSent = new Map([[failedTrucking.id, ["gate-in"]]]);
    const leftWithoutDocument = new Map([[left.id, "Transit T1"]]);
    const out = buildOperationsFacts(facts({ records: records([refused, failedTrucking, left], { truckingNotSent, leftWithoutDocument }) }));

    const cockpit = buildCockpit(cockpitInput({ items: [refused, failedTrucking, left], truckingNotSent, leftWithoutDocument }));
    const cockpitTags = new Map([...cockpit.urgent.rows, ...cockpit.attention.rows].map((r) => [r.id, r.tags]));
    const s1 = out.shipments.find((s) => s.shipmentId === S1)!;
    // By their WCZ ref (made in this order).
    expect(s1.records.map((r) => r.id)).toEqual([refused.id, failedTrucking.id, left.id]);
    for (const r of s1.records) expect(r.signals).toEqual(cockpitTags.get(r.id));
    expect(s1.records.find((r) => r.id === refused.id)!.signals).toEqual([
      { text: `Refused ${stampText(hoursAgo(2))}: no delivery order`, urgent: true },
      { text: "MRN missing", urgent: false },
    ]);
    expect(s1.records.find((r) => r.id === failedTrucking.id)).toMatchObject({ ref: failedTrucking.positionRef, lifecycle: "Ready for release", signals: [{ text: "Not sent to Trucking: gate-in", urgent: true }] });
    expect(s1.records.find((r) => r.id === left.id)!.signals[0]!.text).toMatch(/^Left under customs control \(T1 transit\)/);
  });

  it("lists a record still in play with no signal, with no tags; the gate ref stands in for a missing WCZ ref", () => {
    const quiet = item({ positionRef: "", gateRef: "GATE-7", lifecycle: { stage: "in_warehouse", label: "In warehouse", at: null, refused: true, steps: [] } as unknown as GateMovementItem["lifecycle"] });
    const out = buildOperationsFacts(facts({ records: records([quiet]) }));
    expect(out.shipments[0]!.records).toEqual([{ id: quiet.id, ref: "GATE-7", lifecycle: "In warehouse · Refused", signals: [] }]);
  });

  it("answers every shipment asked, once, in the order asked — records under their own shipment only", () => {
    const a = item({ shipmentId: S1 });
    const b = item({ shipmentId: S2, pinLocked: true });
    const other = item({ shipmentId: S3, pinLocked: true });
    const walkIn = item({ shipmentId: null, pinLocked: true });
    const out = buildOperationsFacts(facts({ shipmentIds: [S2, S1], records: records([a, b, other, walkIn]) }));
    expect(out.shipments.map((s) => [s.shipmentId, s.records.map((r) => r.id)])).toEqual([
      [S2, [b.id]],
      [S1, [a.id]],
    ]);
  });
});

describe("containers the shipment's cargo is on", () => {
  it("are records of each shipment with a house on them, once, after its positions, with the container's own signals", () => {
    const a = item({ shipmentId: S1, positionRef: "WCZ1" });
    const a2 = item({ shipmentId: S1, positionRef: "WCZ2" });
    const b = item({ shipmentId: S2, positionRef: "WCZ3" });
    const closed = container({ number: "MSKU1234565", status: "Closed", closedAt: hoursAgo(30) });
    const notOurs = container({ status: "Closed", closedAt: hoursAgo(30) });
    const out = buildOperationsFacts(
      facts({
        records: records([a, a2, b]),
        containers: { items: [closed, notOurs], movementIds: new Map([[closed.id, [a.id, a2.id, b.id]], [notOurs.id, ["m-of-another-shipment"]]]) },
      }),
    );
    const want = { id: closed.id, ref: "MSKU1234565", lifecycle: "Closed", signals: [{ text: `Closed ${stampText(hoursAgo(30))}, no gate-out`, urgent: false }] };
    expect(out.shipments[0]!.records.map((r) => r.ref)).toEqual(["WCZ1", "WCZ2", "MSKU1234565"]);
    expect(out.shipments[0]!.records[2]).toEqual(want);
    expect(out.shipments[1]!.records.map((r) => r.ref)).toEqual(["WCZ3", "MSKU1234565"]);
    // The same tags as its row on Warehouse → Managers.
    const cockpit = buildCockpit(cockpitInput({ containers: [closed] }));
    expect(cockpit.attention.rows[0]!.tags).toEqual(want.signals);
  });

  it("links a container through any live record of the shipment, even one no longer in play", () => {
    const gone = container({ status: "Closed", closedAt: hoursAgo(30) });
    const out = buildOperationsFacts(facts({ records: { ...records([]), rows: [{ id: "m-left", shipmentId: S1 }] }, containers: { items: [gone], movementIds: new Map([[gone.id, ["m-left"]]]) } }));
    expect(out.shipments[0]!.records.map((r) => r.id)).toEqual([gone.id]);
  });
});

describe("updates to the shipment", () => {
  it("count those waiting past the stale limit and those failed; 0 when there are none", () => {
    const out = buildOperationsFacts(facts({ updates: new Map([[S2, { failed: 1, stalePending: 3 }]]) }));
    expect(out.shipments.map((s) => [s.updatesWaiting, s.updatesFailed])).toEqual([
      [0, 0],
      [3, 1],
    ]);
  });

  it("are null — never 0 — when they could not be read, and notKnown says so", () => {
    const out = buildOperationsFacts(facts({ updates: null, notKnown: ["the warehouse's updates to the shipments"] }));
    expect(out.shipments.map((s) => [s.updatesWaiting, s.updatesFailed])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(out.notKnown).toEqual(["the warehouse's updates to the shipments"]);
  });
});

describe("a part not read", () => {
  it("gives none of its records: no records and no containers without the records", () => {
    const c = container({ status: "Closed", closedAt: hoursAgo(30) });
    const out = buildOperationsFacts(facts({ records: null, containers: { items: [c], movementIds: new Map([[c.id, ["m1"]]]) }, notKnown: ["the warehouse's records"] }));
    expect(out.shipments.every((s) => s.records.length === 0)).toBe(true);
    expect(out.notKnown).toEqual(["the warehouse's records"]);
  });

  it("containers not read: the positions still come", () => {
    const a = item({ pinLocked: true });
    const out = buildOperationsFacts(facts({ records: records([a]), containers: null }));
    expect(out.shipments[0]!.records.map((r) => r.id)).toEqual([a.id]);
  });
});

describe("the endpoint", () => {
  it("is internal, signed in, for the caller's company, at most 2000 shipments", () => {
    const src = readFileSync(path.join(__dirname, "../controllers/_internalOperationsFacts.controller.ts"), "utf8");
    expect(src).toMatch(/expose: false, auth: true, method: "POST", path: "\/internal\/warehouse-concept\/operations-facts"/);
    expect(src).toMatch(/getAuthData\(\)!\.companyID/);
    expect(src).toMatch(/MaxLen<2000>/);
  });
});
