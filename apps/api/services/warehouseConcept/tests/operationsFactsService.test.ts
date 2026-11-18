import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import { operationsFactsService } from "../services/operationsFacts.service";

// The operations facts service with its reads replaced: each part is read on its own, and one that
// fails is named in notKnown and gives none of its figures. No database.

const { recordFacts, containerFacts, unsentHealthByShipment } = vi.hoisted(() => ({
  recordFacts: vi.fn(),
  containerFacts: vi.fn(),
  unsentHealthByShipment: vi.fn(),
}));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../services/managersCockpit.service", () => ({ managersCockpitService: { recordFacts, containerFacts } }));
vi.mock("../repositories/shipmentOutbox.repository", () => ({ shipmentOutboxRepository: { unsentHealthByShipment } }));

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const COMPANY = "c0c0c0c0-0000-4000-8000-000000000000";
const NOW = new Date("2026-10-23T10:00:00Z");

const record = { id: "m1", shipmentId: S1 };
const item = {
  ...record,
  gateRef: "G1",
  positionRef: "WCZ1",
  warehouseTaskId: "t1",
  visit: "výdej",
  handling: "Import",
  customsStatus: "Customs Cleared/Released",
  mrn: "26CZ1",
  status: "In Warehouse",
  pinLocked: true,
  releaseGates: [],
  openExceptions: 0,
  exceptions: [],
  events: [],
  dockSlots: [],
  transportLegs: [],
  subPositions: [],
  storage: { started: false, stopped: false, chargeableDays: 0, freeDaysLeft: 7 },
  lifecycle: { stage: "in_warehouse", label: "In warehouse", at: null, refused: false, steps: [] },
} as unknown as GateMovementItem;
const closed = { id: "k1", number: "MSKU1", kind: "export", status: "Closed", closedAt: "2026-10-22T04:00:00Z", gateOutAt: null, positions: [], totals: { overCapacity: false } };

beforeEach(() => {
  recordFacts.mockReset().mockResolvedValue({ rows: [record], items: [item], truckingNotSent: new Map(), leftWithoutDocument: new Map() });
  containerFacts.mockReset().mockResolvedValue({ items: [closed], movementIds: new Map([["k1", ["m1"]]]) });
  unsentHealthByShipment.mockReset().mockResolvedValue(new Map([[S1, { failed: 2, stalePending: 1 }]]));
});

describe("operations facts (service)", () => {
  it("reads the records of the shipments asked, their containers and the updates, with the cockpit's own reads", async () => {
    const out = await operationsFactsService.forShipments(COMPANY, [S1, S2, "not-a-uuid", S1], NOW);
    expect(recordFacts).toHaveBeenCalledWith(COMPANY, NOW, { shipmentIds: [S1, S2] });
    expect(containerFacts).toHaveBeenCalledWith(COMPANY, NOW, ["m1"]);
    expect(unsentHealthByShipment).toHaveBeenCalledWith(30, COMPANY, [S1, S2]);
    expect(out.notKnown).toEqual([]);
    expect(out.shipments).toEqual([
      {
        shipmentId: S1,
        records: [
          { id: "m1", ref: "WCZ1", lifecycle: "In warehouse", signals: [{ text: "Pick-up PIN: locked", urgent: true }] },
          { id: "k1", ref: "MSKU1", lifecycle: "Closed", signals: [{ text: "Closed 22.10. 06:00, no gate-out", urgent: false }] },
        ],
        updatesWaiting: 1,
        updatesFailed: 2,
      },
      { shipmentId: S2, records: [], updatesWaiting: 0, updatesFailed: 0 },
    ]);
  });

  it("the updates not read: null for every shipment and said in notKnown; the records still come", async () => {
    unsentHealthByShipment.mockRejectedValue(new Error("connection refused"));
    const out = await operationsFactsService.forShipments(COMPANY, [S1, S2], NOW);
    expect(out.notKnown).toEqual(["the warehouse's updates to the shipments"]);
    expect(out.shipments.map((s) => [s.updatesWaiting, s.updatesFailed])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(out.shipments[0]!.records).toHaveLength(2);
  });

  it("the records not read: no records, no container read, the updates still come", async () => {
    recordFacts.mockRejectedValue(new Error("timeout"));
    const out = await operationsFactsService.forShipments(COMPANY, [S1], NOW);
    expect(out.notKnown).toEqual(["the warehouse's records"]);
    expect(containerFacts).not.toHaveBeenCalled();
    expect(out.shipments).toEqual([{ shipmentId: S1, records: [], updatesWaiting: 1, updatesFailed: 2 }]);
  });

  it("the containers not read: the positions still come", async () => {
    containerFacts.mockRejectedValue(new Error("timeout"));
    const out = await operationsFactsService.forShipments(COMPANY, [S1], NOW);
    expect(out.notKnown).toEqual(["the containers in the warehouse"]);
    expect(out.shipments[0]!.records.map((r) => r.id)).toEqual(["m1"]);
  });

  it("asks nothing for no shipment, and no container read when the shipments have no record", async () => {
    expect(await operationsFactsService.forShipments(COMPANY, ["CZ00000053"], NOW)).toEqual({ shipments: [], notKnown: [] });
    expect(recordFacts).not.toHaveBeenCalled();
    expect(unsentHealthByShipment).not.toHaveBeenCalled();
    recordFacts.mockResolvedValue({ rows: [], items: [], truckingNotSent: new Map(), leftWithoutDocument: new Map() });
    unsentHealthByShipment.mockResolvedValue(new Map());
    const out = await operationsFactsService.forShipments(COMPANY, [S2], NOW);
    expect(containerFacts).not.toHaveBeenCalled();
    expect(out).toEqual({ shipments: [{ shipmentId: S2, records: [], updatesWaiting: 0, updatesFailed: 0 }], notKnown: [] });
  });
});
